/**
 * Taking over one IMAP folder into a Stalwart folder: the UIDs above the last run in pages, mails
 * Stalwart already has (same Message-ID) only get the folder, new ones are imported. Shared by the
 * move from Gmail & Co. (sync-runner.ts) and external accounts (server/external/fetcher.ts).
 */
import { imapCategories } from "./categories";
import { keywordsOf } from "./imap-folders";
import { type ImapSource, MAX_MAIL_BYTES, type MailHead } from "./imap-source";
import { type Importer, INLINE_LIMIT, type MailToImport } from "./importer";
import type { FolderState, SyncCounts } from "./syncs";

const HEADS_PAGE = 200;
const BATCH = 25;

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

export type FolderSync = {
  importer: Importer;
  source: ImapSource;
  accountId: string;
  path: string;
  mailboxId: string;
  /** Message-ID → email id of what the account already has; grows with every import. */
  known: Map<string, string>;
  counts: SyncCounts;
  previous: FolderState | undefined;
  /** Called after every page with the folder's new state, so a broken run resumes there. */
  save: (state: FolderState) => Promise<void>;
  /** Extra keywords for every imported mail (e.g. none of the old flags: the mail is new). */
  keywordsFor?: (head: MailHead) => Record<string, true>;
};

/** Syncs one folder; returns its state after the run. */
export const syncFolder = async ({
  importer,
  source,
  accountId,
  path,
  mailboxId,
  known,
  counts,
  previous,
  save,
  keywordsFor = (head) => keywordsOf(head.flags),
}: FolderSync): Promise<FolderState> => {
  let listed = await source.newUids(path, previous?.lastUid ?? 0);
  // A new UIDVALIDITY means the folder was rebuilt: start over (duplicates are skipped).
  if (previous && listed.uidValidity !== previous.uidValidity)
    listed = await source.newUids(path, 0);
  const after = previous?.uidValidity === listed.uidValidity ? (previous.lastUid ?? 0) : 0;
  let state: FolderState = { uidValidity: listed.uidValidity, lastUid: after };
  const uids = listed.uids;
  for (let start = 0; start < uids.length; start += HEADS_PAGE) {
    const heads = await source.heads(path, uids.slice(start, start + HEADS_PAGE));
    const fresh = heads.filter((head) => !head.messageId || !known.has(head.messageId));
    const again = heads.filter((head) => head.messageId && known.get(head.messageId));
    await importer.addToFolders(
      accountId,
      Object.fromEntries(again.map((head) => [known.get(head.messageId!)!, mailboxId])),
    );
    counts.added += again.length;
    // Larger than the limit by the server's own word: not even fetched.
    const fitting = fresh.filter((head) => head.size <= MAX_MAIL_BYTES);
    counts.failed += fresh.length - fitting.length;
    for (const batch of batchesOf(fitting)) {
      const raw = await source.sources(
        path,
        batch.map((head) => head.uid),
      );
      const taken = batch.flatMap((head) => {
        const data = raw.get(head.uid);
        const mail: MailToImport | null = data
          ? {
              raw: data,
              mailboxId,
              keywords: keywordsFor(head),
              categories: imapCategories(head.flags),
              receivedAt: head.internalDate?.toISOString().replace(/\.\d{3}Z$/, "Z") ?? null,
            }
          : null;
        return mail ? [{ head, mail }] : [];
      });
      const outcome = await importer.importMails(
        accountId,
        taken.map(({ mail }) => mail),
      );
      counts.imported += outcome.imported;
      counts.failed += batch.length - outcome.imported;
      // The ids follow the mails sent, not the batch: one that did not come leaves a gap there.
      taken.forEach(({ head }, i) => {
        const id = outcome.ids[i];
        if (head.messageId && id) known.set(head.messageId, id);
      });
    }
    state = { uidValidity: listed.uidValidity, lastUid: heads.at(-1)?.uid ?? after };
    await save(state);
  }
  return state;
};
