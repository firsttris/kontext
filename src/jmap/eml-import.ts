/**
 * .eml files into a folder: each file uploaded as a blob, then Email/import (RFC 8621 §4.8) with
 * the folder as its only mailbox and marked read. Stalwart refuses a blob that holds no RFC 5322
 * header with `invalidEmail` (crates/jmap/src/email/import.rs); that comes back as the reason.
 */
import { chunk } from "@/lib/chunk";
import { CAPABILITIES, type JmapClient } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.mail];
/** Below Stalwart's maxObjectsInSet; an import call names blobs, not their content. */
const PAGE = 50;

export type EmlFile = { name: string; data: Blob; receivedAt?: string };
export type EmlFailure = { name: string; reason: string };
export type EmlOutcome = { imported: number; failed: EmlFailure[] };

type Uploaded = { name: string; blobId: string; receivedAt?: string };
type SetError = { type: string; description?: string };

const uploadAll = async (client: JmapClient, accountId: string, files: EmlFile[]) => {
  const uploaded: Uploaded[] = [];
  const failed: EmlFailure[] = [];
  for (const file of files) {
    try {
      const { blobId } = await client.upload(accountId, file.data, "message/rfc822");
      uploaded.push({ name: file.name, blobId, receivedAt: file.receivedAt });
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
        keywords: { $seen: true },
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
