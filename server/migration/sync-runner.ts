/**
 * Keeps a move from Gmail & Co. going: the first run takes over all mail, later runs (every 15
 * minutes, or on demand) only what is new, one way only; nothing is ever changed or deleted at the
 * old provider. A mail Gmail shows under several labels is imported once and put into each folder.
 * Gmail lets IMAP download about 2.5 GB a day: a big mailbox simply takes several runs.
 */
import type { Sealer } from "../crypto";
import { folderOrder, imapTarget, keywordsOf } from "./imap-folders";
import { type ImapSource, type MailHead, openImap } from "./imap-source";
import { type Importer, INLINE_LIMIT, type MailToImport } from "./importer";
import type { Graph } from "./m365/graph";
import { runM365 } from "./m365/sync";
import { folderResolver } from "./resolve";
import type { Sync, SyncCounts, Syncs } from "./syncs";

export const SYNC_EVERY_MS = 15 * 60 * 1000;
const HEADS_PAGE = 200;
const BATCH = 25;

export type SyncRunnerDeps = {
  syncs: Syncs;
  importer: Importer;
  sealer: Sealer;
  /** Tests against the local Stalwart: IMAP without TLS. */
  allowPlain?: boolean;
  /** The Graph client of the company's Microsoft 365 app, if connected. */
  microsoft?: () => Promise<Graph | null>;
};

/** Mails of one page split into batches of at most 25 mails or 6 MB. */
export const batchesOf = (heads: MailHead[]): MailHead[][] => {
  const batches: MailHead[][] = [];
  let current: MailHead[] = [];
  let bytes = 0;
  for (const head of heads) {
    if (current.length && (current.length >= BATCH || bytes + head.size > INLINE_LIMIT)) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(head);
    bytes += head.size;
  }
  if (current.length) batches.push(current);
  return batches;
};

export const createSyncRunner = ({
  syncs,
  importer,
  sealer,
  allowPlain = false,
  microsoft,
}: SyncRunnerDeps) => {
  /** One folder: new UIDs in pages, known mails get the folder, new ones are imported. */
  const syncFolder = async (
    sync: Sync,
    source: ImapSource,
    path: string,
    mailboxId: string,
    known: Map<string, string>,
    counts: SyncCounts,
  ) => {
    const previous = sync.state[path];
    let listed = await source.newUids(path, previous?.lastUid ?? 0);
    // A new UIDVALIDITY means the folder was rebuilt: start over (duplicates are skipped).
    if (previous && listed.uidValidity !== previous.uidValidity)
      listed = await source.newUids(path, 0);
    const after = previous?.uidValidity === listed.uidValidity ? previous.lastUid : 0;
    const uids = listed.uids;
    for (let start = 0; start < uids.length; start += HEADS_PAGE) {
      const heads = await source.heads(path, uids.slice(start, start + HEADS_PAGE));
      const fresh = heads.filter((head) => !head.messageId || !known.has(head.messageId));
      const again = heads.filter((head) => head.messageId && known.get(head.messageId));
      await importer.addToFolders(
        sync.accountId,
        Object.fromEntries(again.map((head) => [known.get(head.messageId!)!, mailboxId])),
      );
      counts.added += again.length;
      for (const batch of batchesOf(fresh)) {
        const raw = await source.sources(
          path,
          batch.map((head) => head.uid),
        );
        const mails: MailToImport[] = batch.flatMap((head) => {
          const data = raw.get(head.uid);
          return data
            ? [
                {
                  raw: data,
                  mailboxId,
                  keywords: keywordsOf(head.flags),
                  receivedAt: head.internalDate?.toISOString().replace(/\.\d{3}Z$/, "Z") ?? null,
                },
              ]
            : [];
        });
        const outcome = await importer.importMails(sync.accountId, mails);
        counts.imported += outcome.imported;
        counts.failed += batch.length - outcome.imported;
        batch.forEach((head, i) => {
          const id = outcome.ids[i];
          if (head.messageId && id) known.set(head.messageId, id);
        });
      }
      sync.state[path] = { uidValidity: listed.uidValidity, lastUid: heads.at(-1)?.uid ?? after };
      await syncs.update(sync.id, { state: sync.state, counts });
    }
    if (!uids.length) sync.state[path] = { uidValidity: listed.uidValidity, lastUid: after };
  };

  /** A run from an IMAP mailbox (Gmail & Co.). */
  const runImap = async (sync: Sync, counts: SyncCounts): Promise<string | null> => {
    const opened = await openImap(
      { host: sync.host, port: sync.port },
      { user: sync.login, password: await sealer.open(sync.secret) },
      allowPlain,
    );
    if (!opened.ok) {
      if (opened.error.reason !== "login") throw new Error(opened.error.message);
      return "login-failed";
    }
    const source = opened.value;
    try {
      const known = await importer.knownMessageIds(sync.accountId);
      const resolve = folderResolver(
        importer,
        sync.accountId,
        await importer.folders(sync.accountId),
      );
      const folders = (await source.folders())
        .flatMap((folder) => {
          const target = imapTarget(folder);
          return target ? [{ folder, target }] : [];
        })
        .sort((a, b) => folderOrder(a.target, b.target));
      for (const { folder, target } of folders) {
        await syncFolder(sync, source, folder.path, await resolve(target), known, counts);
      }
      return null;
    } finally {
      await source.close();
    }
  };

  /** A run from Microsoft 365, with the company's app. */
  const runMicrosoft = async (sync: Sync, counts: SyncCounts): Promise<string | null> => {
    const graph = await microsoft?.();
    if (!graph) throw new Error("Microsoft 365 ist nicht (mehr) verbunden.");
    await runM365({
      graph,
      importer,
      accountId: sync.accountId,
      user: sync.login,
      state: sync.state,
      counts,
      save: () => syncs.update(sync.id, { state: sync.state, counts }),
    });
    return null;
  };

  const run = async (id: string): Promise<void> => {
    const sync = await syncs.get(id);
    if (sync?.status !== "active") return;
    await syncs.update(id, { status: "running", lastError: null });
    const counts = { ...sync.counts };
    try {
      const failed = await (sync.provider === "m365" ? runMicrosoft : runImap)(sync, counts);
      await syncs.update(id, {
        status: failed ? "login-failed" : "active",
        state: sync.state,
        counts,
        lastRunAt: new Date(),
        lastError: failed
          ? "Die Anmeldung wurde abgelehnt. Wurde das (App-)Passwort geändert? Bitte neu eintragen."
          : null,
      });
    } catch (error) {
      await syncs.update(id, {
        status: "active",
        counts,
        lastRunAt: new Date(),
        lastError: (error as Error).message,
      });
    }
  };

  // One run at a time, so a small server and the provider's limits are not overrun.
  let queue = Promise.resolve();
  const waiting = new Set<string>();
  const enqueue = (id: string) => {
    if (waiting.has(id)) return queue;
    waiting.add(id);
    queue = queue
      .then(() => run(id))
      .catch(() => undefined)
      .finally(() => waiting.delete(id));
    return queue;
  };

  /** Every minute: the active moves whose last run is older than 15 minutes. */
  const start = async () => {
    for (const sync of await syncs.list()) {
      if (sync.status === "running") await syncs.update(sync.id, { status: "active" });
    }
    const tick = async () => {
      for (const sync of await syncs.list()) {
        const due = !sync.lastRunAt || Date.now() - sync.lastRunAt.getTime() >= SYNC_EVERY_MS;
        if (sync.status === "active" && due) void enqueue(sync.id);
      }
    };
    void tick();
    return setInterval(() => void tick(), 60_000);
  };

  return { enqueue, start };
};

export type SyncRunner = ReturnType<typeof createSyncRunner>;
