/**
 * One run of a move from Microsoft 365 for one person, with the app the customer's admin allowed
 * (Mail.Read, Contacts.Read, Calendars.Read, User.Read.All as application permissions):
 *
 * - mails per folder with Graph's delta query, so a later run gets only what is new; each new
 *   mail as MIME ($value) into the same folder; Outlook's special folders by their well-known name
 *   (any language), deleted items, junk and the like left out
 * - contacts of the default folder and appointments (single ones and series) on every run; what
 *   is there already is skipped
 *
 * Read only: nothing changes at Microsoft.
 */
import type { TargetFolder } from "../folders";
import { type Importer, INLINE_LIMIT, type MailToImport } from "../importer";
import { addCards, addEvents } from "../pim";
import { folderResolver } from "../resolve";
import type { FolderState, SyncCounts } from "../syncs";
import { GERMAN_TIME, type Graph } from "./graph";
import {
  contactToCard,
  eventToJSCalendar,
  type GraphContact,
  type GraphEvent,
  WELL_KNOWN,
} from "./map";

type GraphFolder = { id: string; displayName: string; childFolderCount?: number };
type GraphMessage = {
  id: string;
  internetMessageId?: string | null;
  isRead?: boolean;
  flag?: { flagStatus?: string } | null;
  receivedDateTime?: string | null;
  "@removed"?: unknown;
};

const BATCH = 25;
const MESSAGE_FIELDS = "internetMessageId,isRead,flag,receivedDateTime";
const EVENT_FIELDS =
  "iCalUId,subject,body,bodyPreview,start,end,isAllDay,showAs,location,recurrence,type";

export type M365Run = {
  graph: Graph;
  importer: Importer;
  accountId: string;
  /** The Microsoft 365 mailbox (user principal name). */
  user: string;
  state: Record<string, FolderState>;
  counts: SyncCounts;
  save: () => Promise<void>;
};

/** Folder ids of the well-known folders; a missing one (no archive yet) is left out. */
const wellKnownIds = async (graph: Graph, base: string) => {
  const ids = new Map<string, string | null>();
  for (const [name, role] of Object.entries(WELL_KNOWN)) {
    const folder = await graph
      .get<{ id: string }>(`${base}/mailFolders/${name}?$select=id`)
      .catch(() => null);
    if (folder) ids.set(folder.id, role);
  }
  return ids;
};

/** All folders with their target, walking the tree from the top. */
const foldersOf = async (graph: Graph, base: string) => {
  const special = await wellKnownIds(graph, base);
  const result: { id: string; target: TargetFolder }[] = [];
  const walk = async (url: string, parent: TargetFolder | null): Promise<void> => {
    const { items } = await graph.all<GraphFolder>(url);
    for (const folder of items) {
      const role = special.get(folder.id);
      if (role === null) continue; // deleted items, junk, outbox …: not moved, nor below them
      const target: TargetFolder = role
        ? { role, path: [] }
        : parent
          ? { role: parent.role, path: [...parent.path, folder.displayName] }
          : { role: null, path: [folder.displayName] };
      result.push({ id: folder.id, target });
      if (folder.childFolderCount) {
        await walk(`${base}/mailFolders/${folder.id}/childFolders?$top=100`, target);
      }
    }
  };
  await walk(`${base}/mailFolders?$top=100`, null);
  // The inbox first, as with IMAP.
  return result.sort(
    (a, b) => Number(b.target.role === "inbox") - Number(a.target.role === "inbox"),
  );
};

const toKeywords = (message: GraphMessage): Record<string, true> => ({
  ...(message.isRead ? { $seen: true as const } : {}),
  ...(message.flag?.flagStatus === "flagged" ? { $flagged: true as const } : {}),
});

const syncMails = async (run: M365Run, base: string) => {
  const { graph, importer, accountId, state, counts, save } = run;
  const known = await importer.knownMessageIds(accountId);
  const resolve = folderResolver(importer, accountId, await importer.folders(accountId));
  for (const { id, target } of await foldersOf(graph, base)) {
    const start =
      state[id]?.deltaLink ?? `${base}/mailFolders/${id}/messages/delta?$select=${MESSAGE_FIELDS}`;
    const { items, deltaLink } = await graph.all<GraphMessage>(start, "odata.maxpagesize=100");
    const mailboxId = await resolve(target);
    let batch: MailToImport[] = [];
    let bytes = 0;
    const flush = async () => {
      if (!batch.length) return;
      const outcome = await importer.importMails(accountId, batch);
      counts.imported += outcome.imported;
      counts.failed += batch.length - outcome.imported;
      batch = [];
      bytes = 0;
      await save();
    };
    for (const message of items) {
      if (message["@removed"]) continue;
      const messageId = message.internetMessageId?.replace(/^<|>$/g, "") || null;
      if (messageId && known.has(messageId)) continue;
      const raw = await graph.mime(run.user, message.id);
      if (messageId) known.set(messageId, "");
      if (batch.length >= BATCH || bytes + raw.length > INLINE_LIMIT) await flush();
      batch.push({
        raw,
        mailboxId,
        keywords: toKeywords(message),
        receivedAt: message.receivedDateTime?.replace(/\.\d+Z$/, "Z") ?? null,
      });
      bytes += raw.length;
      if (raw.length > INLINE_LIMIT) await flush();
    }
    await flush();
    if (deltaLink) state[id] = { deltaLink };
    await save();
  }
};

export const runM365 = async (run: M365Run): Promise<void> => {
  const base = `/users/${encodeURIComponent(run.user)}`;
  await syncMails(run, base);

  const contacts = { total: 0, imported: 0, skipped: 0, failed: 0 };
  const { items: graphContacts } = await run.graph.all<GraphContact>(`${base}/contacts?$top=100`);
  await addCards(run.importer, run.accountId, graphContacts.map(contactToCard), contacts);

  const events = { total: 0, imported: 0, skipped: 0, failed: 0 };
  const { items: graphEvents } = await run.graph.all<GraphEvent>(
    `${base}/events?$top=100&$select=${EVENT_FIELDS}`,
    GERMAN_TIME,
  );
  await addEvents(
    run.importer,
    run.accountId,
    graphEvents
      .filter((event) => event.iCalUId)
      .map((event) => ({ event: eventToJSCalendar(event, "Europe/Berlin"), uid: event.iCalUId! })),
    events,
  );
  run.counts.contacts = (run.counts.contacts ?? 0) + contacts.imported;
  run.counts.events = (run.counts.events ?? 0) + events.imported;
  await run.save();
};
