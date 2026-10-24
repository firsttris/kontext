/**
 * "Auch auf vorhandene Mails anwenden": the rules run once over the mails in the inbox, moving and
 * marking with Email/set (RFC 8621). Nothing is forwarded, so old mail does not go out again. The
 * JMAP access is passed in, like in filters.ts: the app for the own mailbox, the server for a
 * shared one.
 */
import type { Invocation } from "./filters";
import { type MailFacts, outcome, readsBody } from "./match";
import type { Rule } from "./script";

type Request = (calls: Invocation[], using: string[]) => Promise<Invocation[]>;

const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];

/** The newest mails only; an old inbox is sorted step by step, not in one long request. */
const LIMIT = 1000;
const CHUNK = 100;

type Address = { email?: string | null };
type Fetched = {
  id: string;
  from: Address[] | null;
  to: Address[] | null;
  cc: Address[] | null;
  subject: string | null;
  textBody?: { partId: string }[];
  bodyValues?: Record<string, { value: string }>;
};

const emails = (addresses: Address[] | null) =>
  (addresses ?? []).map((address) => address.email ?? "").filter(Boolean);

export const factsOf = (mail: Fetched): MailFacts => ({
  from: emails(mail.from),
  to: [...emails(mail.to), ...emails(mail.cc)],
  subject: mail.subject ?? "",
  body: (mail.textBody ?? []).map((part) => mail.bodyValues?.[part.partId]?.value ?? "").join("\n"),
});

/** The Email/set patch for one mail, or null when the rules leave it as it is. */
export const patchFor = (
  rules: Rule[],
  mail: Fetched,
  inboxId: string,
  folderIds: Set<string>,
): Record<string, boolean | null> | null => {
  const { moveTo, markRead, flag } = outcome(rules, factsOf(mail));
  const patch: Record<string, boolean | null> = {};
  if (moveTo && moveTo.id !== inboxId && folderIds.has(moveTo.id)) {
    patch[`mailboxIds/${inboxId}`] = null;
    patch[`mailboxIds/${moveTo.id}`] = true;
  }
  if (markRead) patch["keywords/$seen"] = true;
  if (flag) patch["keywords/$flagged"] = true;
  return Object.keys(patch).length ? patch : null;
};

const chunks = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, index) =>
    items.slice(index * CHUNK, (index + 1) * CHUNK),
  );

/** Runs `rules` over the inbox of `accountId`; how many mails it changed. */
export const applyToInbox = async (
  request: Request,
  accountId: string,
  rules: Rule[],
): Promise<number> => {
  const [boxes] = await request(
    [["Mailbox/get", { accountId, properties: ["role"] }, "boxes"]],
    USING,
  );
  const folders = boxes![1].list as { id: string; role: string | null }[];
  const inboxId = folders.find((box) => box.role === "inbox")?.id;
  if (!inboxId) return 0;
  const folderIds = new Set(folders.map((box) => box.id));
  const [query] = await request(
    [
      [
        "Email/query",
        {
          accountId,
          filter: { inMailbox: inboxId },
          sort: [{ property: "receivedAt", isAscending: false }],
          limit: LIMIT,
        },
        "query",
      ],
    ],
    USING,
  );
  const body = readsBody(rules);
  const properties = ["from", "to", "cc", "subject", ...(body ? ["textBody", "bodyValues"] : [])];

  let changed = 0;
  for (const ids of chunks(query![1].ids as string[])) {
    const [get] = await request(
      [
        [
          "Email/get",
          { accountId, ids, properties, fetchTextBodyValues: body, maxBodyValueBytes: 100_000 },
          "get",
        ],
      ],
      USING,
    );
    const update = Object.fromEntries(
      (get![1].list as Fetched[]).flatMap((mail) => {
        const patch = patchFor(rules, mail, inboxId, folderIds);
        return patch ? [[mail.id, patch]] : [];
      }),
    );
    if (!Object.keys(update).length) continue;
    const [set] = await request([["Email/set", { accountId, update }, "set"]], USING);
    changed += Object.keys((set![1].updated as object | null) ?? {}).length;
  }
  return changed;
};
