/**
 * Works through the moves one after another: open the PST, then mails, contacts and appointments
 * into the account, with progress after every batch. A second run of the same file only adds what
 * is missing (Message-ID, name and address, UID), so a failed or repeated move is safe.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { mailFacts } from "./eml";
import { targetFolder } from "./folders";
import { type Importer, INLINE_LIMIT, type MailToImport } from "./importer";
import { eventUid, splitVCards } from "./items";
import { emptyProgress, type Job, type Jobs, type Progress } from "./jobs";
import { addCards, addEvents } from "./pim";
import { extractPst, listItems, type PstItem } from "./pst";
import { folderResolver } from "./resolve";

const BATCH = 25;
const PARSE_BATCH = 50;

export type RunnerDeps = {
  jobs: Jobs;
  importer: Importer;
  /** Where uploads and opened files live (`<id>.upload`, `<id>/`). */
  workDir: string;
  extract?: typeof extractPst;
};

/** Where an uploaded file waits until its move is done. */
export const uploadFileOf = (workDir: string, id: string) => join(workDir, `${id}.upload`);

const chunks = <T>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, i * size + size),
  );

export const createRunner = ({ jobs, importer, workDir, extract = extractPst }: RunnerDeps) => {
  const importMails = async (
    job: Job,
    items: PstItem[],
    progress: Progress,
    save: () => Promise<void>,
  ) => {
    const mails = items.flatMap((item) => {
      const target = targetFolder(item.folder);
      return target ? [{ item, target }] : [];
    });
    progress.mails.total = mails.length;
    await save();
    const known = await importer.knownMessageIds(job.accountId);
    const resolve = folderResolver(importer, job.accountId, await importer.folders(job.accountId));

    let batch: MailToImport[] = [];
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const outcome = await importer.importMails(job.accountId, batch);
      progress.mails.imported += outcome.imported;
      progress.mails.failed += batch.length - outcome.imported;
      batch = [];
      bytes = 0;
      await save();
    };
    for (const { item, target } of mails) {
      const raw = new Uint8Array(await readFile(item.file));
      const facts = mailFacts(Buffer.from(raw.subarray(0, 65_536)).toString("latin1"));
      if (facts.messageId && known.has(facts.messageId)) {
        progress.mails.skipped++;
        continue;
      }
      if (facts.messageId) known.set(facts.messageId, "");
      const mail = {
        raw,
        mailboxId: await resolve(target),
        keywords: (facts.seen ? { $seen: true } : {}) as Record<string, true>,
        receivedAt: facts.receivedAt,
      };
      if (raw.length > INLINE_LIMIT) {
        await flush();
        batch = [mail];
        await flush();
        continue;
      }
      if (batch.length >= BATCH || bytes + raw.length > INLINE_LIMIT) await flush();
      batch.push(mail);
      bytes += raw.length;
    }
    await flush();
  };

  const importContacts = async (
    job: Job,
    texts: string[],
    progress: Progress,
    save: () => Promise<void>,
  ) => {
    progress.contacts.total = texts.length;
    const cards: Record<string, unknown>[] = [];
    for (const page of chunks(texts, PARSE_BATCH)) {
      for (const list of await importer.contacts.parse(job.accountId, page)) {
        const card = list[0] as Record<string, unknown> | undefined;
        if (card) cards.push(card);
        else progress.contacts.failed++;
      }
    }
    await addCards(importer, job.accountId, cards, progress.contacts, save);
  };

  /** Each text is a calendar file with one or (Google's export) many appointments. */
  const importEvents = async (
    job: Job,
    texts: string[],
    progress: Progress,
    save: () => Promise<void>,
  ) => {
    const events: { event: Record<string, unknown>; uid: string }[] = [];
    for (const page of chunks(texts, PARSE_BATCH)) {
      const parsed = await importer.events.parse(job.accountId, page);
      parsed.forEach((list, index) => {
        if (!list.length) {
          progress.events.total++;
          progress.events.failed++;
          return;
        }
        // readpst stamps every export with the current time; that line must not change the uid.
        const content = page[index]!.replace(/^DTSTAMP:.*$/gm, "");
        const hash = createHash("sha256").update(content).digest("hex").slice(0, 32);
        list.forEach((item, n) => {
          const event = item as Record<string, unknown>;
          progress.events.total++;
          events.push({ event, uid: eventUid(event.uid, `import-${hash}${n ? `-${n}` : ""}`) });
        });
      });
    }
    await addEvents(importer, job.accountId, events, progress.events, save);
  };

  const run = async (id: string): Promise<void> => {
    const job = await jobs.get(id);
    if (job?.status !== "queued") return;
    const progress = emptyProgress();
    const save = () => jobs.update(id, { progress });
    const out = join(workDir, id);
    await jobs.update(id, { status: "running", error: null, progress });
    try {
      const file = uploadFileOf(workDir, id);
      if (job.source === "vcf") {
        await importContacts(job, splitVCards(await readFile(file, "utf8")), progress, save);
      } else if (job.source === "ics") {
        await importEvents(job, [await readFile(file, "utf8")], progress, save);
      } else {
        await rm(out, { recursive: true, force: true });
        await mkdir(out, { recursive: true });
        await extract(file, out);
        const items = await listItems(out);
        const texts = (kind: PstItem["kind"]) =>
          Promise.all(items.filter((i) => i.kind === kind).map((i) => readFile(i.file, "utf8")));
        await importMails(
          job,
          items.filter((i) => i.kind === "mail"),
          progress,
          save,
        );
        await importContacts(job, await texts("contact"), progress, save);
        await importEvents(job, await texts("event"), progress, save);
      }
      await jobs.update(id, { status: "done", progress });
      await rm(uploadFileOf(workDir, id), { force: true });
    } catch (error) {
      await jobs.update(id, { status: "failed", error: (error as Error).message, progress });
    } finally {
      await rm(out, { recursive: true, force: true });
    }
  };

  // One move at a time, so a small server is not overrun.
  let queue = Promise.resolve();
  const enqueue = (id: string) => {
    queue = queue.then(() => run(id)).catch(() => undefined);
    return queue;
  };

  /** After a restart: moves that were waiting or running start (again). */
  const resume = async () => {
    for (const job of (await jobs.list()).reverse()) {
      if (job.status === "running") await jobs.update(job.id, { status: "queued" });
      if (job.status === "running" || job.status === "queued") void enqueue(job.id);
    }
  };

  return { enqueue, resume };
};

export type Runner = ReturnType<typeof createRunner>;
