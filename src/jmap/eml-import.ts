/**
 * .eml files and the mails of an .mbox into a folder: each mail uploaded as a blob (RFC 8620
 * §6.1), then Email/import (RFC 8621 §4.8) with the folder as its only mailbox. Stalwart refuses a
 * blob that holds no RFC 5322 header with `invalidEmail` (crates/jmap/src/email/import.rs); that
 * comes back as the reason.
 */
import { chunk } from "@/lib/chunk";
import { receivedAtOf } from "@/lib/eml-import";
import { blobPieces, mboxFlags, splitMbox } from "@/lib/mbox";
import { CAPABILITIES, type JmapClient } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.mail];
/** Below Stalwart's maxObjectsInSet; an import call names blobs, not their content. */
const PAGE = 50;

/** `keywords` default to read only. */
export type EmlFile = {
  name: string;
  data: Blob;
  receivedAt?: string;
  keywords?: Record<string, true>;
};
export type EmlFailure = { name: string; reason: string };
export type EmlOutcome = { imported: number; failed: EmlFailure[] };

type Uploaded = Omit<EmlFile, "data"> & { blobId: string };
type SetError = { type: string; description?: string };

const uploadAll = async (client: JmapClient, accountId: string, files: EmlFile[]) => {
  const uploaded: Uploaded[] = [];
  const failed: EmlFailure[] = [];
  for (const file of files) {
    try {
      const { blobId } = await client.upload(accountId, file.data, "message/rfc822");
      const { data: _data, ...rest } = file;
      uploaded.push({ ...rest, blobId });
    } catch (error) {
      failed.push({ name: file.name, reason: (error as Error).message });
    }
  }
  return { uploaded, failed };
};

const importPage = async (
  client: JmapClient,
  accountId: string,
  mailboxId: string,
  page: Uploaded[],
): Promise<EmlOutcome> => {
  const emails = Object.fromEntries(
    page.map((item, index) => [
      `e${index}`,
      {
        blobId: item.blobId,
        mailboxIds: { [mailboxId]: true },
        keywords: item.keywords ?? { $seen: true },
        ...(item.receivedAt ? { receivedAt: item.receivedAt } : {}),
      },
    ]),
  );
  try {
    const result = await client.call<{
      created?: Record<string, unknown>;
      notCreated?: Record<string, SetError>;
    }>("Email/import", { accountId, emails }, USING);
    const failed = Object.entries(result.notCreated ?? {}).map(([key, error]) => ({
      name: page[Number(key.slice(1))]?.name ?? key,
      reason: error.description ?? error.type,
    }));
    return { imported: Object.keys(result.created ?? {}).length, failed };
  } catch (error) {
    const reason = (error as Error).message;
    return { imported: 0, failed: page.map((item) => ({ name: item.name, reason })) };
  }
};

/** Imports the files into one folder; what fails is named with Stalwart's reason. */
export const importEmlFiles = async (
  client: JmapClient,
  accountId: string,
  mailboxId: string,
  files: EmlFile[],
): Promise<EmlOutcome> => {
  const { uploaded, failed } = await uploadAll(client, accountId, files);
  const outcome: EmlOutcome = { imported: 0, failed };
  for (const page of chunk(uploaded, PAGE)) {
    const result = await importPage(client, accountId, mailboxId, page);
    outcome.imported += result.imported;
    outcome.failed.push(...result.failed);
  }
  return outcome;
};

/** The header of a mail is read for its date and flags; the rest is only uploaded. */
const HEAD_BYTES = 64 * 1024;

export type MboxOutcome = EmlOutcome & { found: number };

/**
 * Imports the mails of an .mbox file into one folder a page at a time, so that only one page of
 * mails is in memory; `onPage` hears the running count. Deleted mails that Thunderbird has not
 * compacted away yet are left out. A failed mail is named "<file> #<its number in the file>".
 */
export const importMbox = async (
  client: JmapClient,
  accountId: string,
  mailboxId: string,
  file: File,
  onPage: (imported: number) => void = () => {},
): Promise<MboxOutcome> => {
  const outcome: MboxOutcome = { imported: 0, failed: [], found: 0 };
  const decoder = new TextDecoder();
  const now = new Date();
  let page: EmlFile[] = [];
  const send = async () => {
    const result = await importEmlFiles(client, accountId, mailboxId, page);
    outcome.imported += result.imported;
    outcome.failed.push(...result.failed);
    page = [];
    onPage(outcome.imported);
  };
  for await (const mail of splitMbox(blobPieces(file))) {
    outcome.found += 1;
    const head = decoder.decode(mail.subarray(0, HEAD_BYTES));
    const { deleted, keywords } = mboxFlags(head);
    if (deleted) continue;
    const name = `${file.name} #${outcome.found}`;
    page.push({ name, data: new Blob([mail]), receivedAt: receivedAtOf(head, now), keywords });
    if (page.length === PAGE) await send();
  }
  if (page.length) await send();
  return outcome;
};
