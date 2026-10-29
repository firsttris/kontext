/** Mails and threads (RFC 8621 §3, §4): query, get, set and copy on the store. */
import {
  type Args,
  type Created,
  changed,
  emailsOf,
  getList,
  type Result,
  resolveId,
  state,
} from "./methods";
import { EMPTY_HEADERS, newId, type Part, previewOf, type Store, type StoredEmail } from "./store";

const text = (value: unknown) => JSON.stringify(value ?? "").toLowerCase();

const addressMatch = (email: StoredEmail, field: string, needle: unknown) =>
  text(email[field]).includes(String(needle).toLowerCase());

/** One filter condition or operator (RFC 8621 §4.4.1), as far as the app uses them. */
export const matches = (email: StoredEmail, filter: Args | null | undefined): boolean => {
  if (!filter) return true;
  if (filter.operator) {
    const conditions = (filter.conditions ?? []) as Args[];
    if (filter.operator === "AND") return conditions.every((c) => matches(email, c));
    if (filter.operator === "OR") return conditions.some((c) => matches(email, c));
    return !conditions.some((c) => matches(email, c));
  }
  const body = () =>
    Object.values((email.bodyValues ?? {}) as Record<string, { value: string }>)
      .map((part) => part.value)
      .join(" ")
      .toLowerCase();
  const tests: Record<string, (value: unknown) => boolean> = {
    inMailbox: (id) => Boolean(email.mailboxIds[String(id)]),
    inMailboxOtherThan: (ids) =>
      Object.keys(email.mailboxIds).some((id) => !(ids as string[]).includes(id)),
    hasKeyword: (keyword) => Boolean(email.keywords[String(keyword)]),
    notKeyword: (keyword) => !email.keywords[String(keyword)],
    allInThreadHaveKeyword: (keyword) => Boolean(email.keywords[String(keyword)]),
    someInThreadHaveKeyword: (keyword) => Boolean(email.keywords[String(keyword)]),
    noneInThreadHaveKeyword: (keyword) => !email.keywords[String(keyword)],
    hasAttachment: (value) => Boolean(email.hasAttachment) === value,
    before: (date) => email.receivedAt < String(date),
    after: (date) => email.receivedAt >= String(date),
    minSize: (size) => Number(email.size) >= Number(size),
    maxSize: (size) => Number(email.size) < Number(size),
    from: (value) => addressMatch(email, "from", value),
    to: (value) => addressMatch(email, "to", value),
    cc: (value) => addressMatch(email, "cc", value),
    bcc: (value) => addressMatch(email, "bcc", value),
    subject: (value) => text(email.subject).includes(String(value).toLowerCase()),
    body: (value) => body().includes(String(value).toLowerCase()),
    text: (value) =>
      ["from", "to", "cc", "subject"].some((field) => addressMatch(email, field, value)) ||
      body().includes(String(value).toLowerCase()),
    header: (value) => {
      const [name, contains] = value as string[];
      const raw = email[`header:${name}`] ?? email[`header:${name}:asText`];
      return contains === undefined ? raw != null : text(raw).includes(contains.toLowerCase());
    },
  };
  return Object.entries(filter).every(([key, value]) => tests[key]?.(value) ?? true);
};

type Comparator = { property: string; isAscending?: boolean; keyword?: string };

const sortKey = (email: StoredEmail, comparator: Comparator): string | number => {
  const first = (field: string) => {
    const list = email[field] as { name: string | null; email: string }[] | null;
    return (list?.[0]?.name || list?.[0]?.email || "").toLowerCase();
  };
  switch (comparator.property) {
    case "size":
      return Number(email.size);
    case "subject":
      return String(email.subject ?? "").toLowerCase();
    case "from":
    case "to":
      return first(comparator.property);
    case "sentAt":
      return String(email.sentAt ?? email.receivedAt);
    case "hasKeyword":
      return email.keywords[comparator.keyword ?? ""] ? 1 : 0;
    default:
      return email.receivedAt;
  }
};

export const sortEmails = (emails: StoredEmail[], sort: Comparator[] | undefined) => {
  const comparators = sort?.length ? sort : [{ property: "receivedAt", isAscending: false }];
  return [...emails].sort((a, b) => {
    for (const comparator of comparators) {
      const [x, y] = [sortKey(a, comparator), sortKey(b, comparator)];
      if (x === y) continue;
      const order = x < y ? -1 : 1;
      return comparator.isAscending === false ? -order : order;
    }
    return 0;
  });
};

export const emailQuery = (store: Store, args: Args): Result => {
  const sorted = sortEmails(
    emailsOf(store, String(args.accountId)).filter((email) => matches(email, args.filter as Args)),
    args.sort as Comparator[] | undefined,
  );
  const seen = new Set<string>();
  const collapsed = args.collapseThreads
    ? sorted.filter((email) => !seen.has(email.threadId) && seen.add(email.threadId))
    : sorted;
  const position = Number(args.position ?? 0);
  const limit = args.limit === undefined ? collapsed.length : Number(args.limit);
  return {
    accountId: args.accountId,
    queryState: state(store),
    canCalculateChanges: false,
    position,
    ids: collapsed.slice(position, position + limit).map((email) => email.id),
    total: collapsed.length,
  };
};

// Email/get

const withoutBodyValues = (email: StoredEmail, args: Args): Record<string, unknown> => {
  const wanted = Boolean(args.fetchHTMLBodyValues || args.fetchTextBodyValues);
  return wanted ? email : { ...email, bodyValues: {} };
};

export const emailGet = (store: Store, args: Args): Result => ({
  accountId: args.accountId,
  state: state(store),
  ...getList(emailsOf(store, String(args.accountId)), args, (email) =>
    withoutBodyValues(email, args),
  ),
});

export const threadGet = (store: Store, args: Args): Result => {
  const emails = sortEmails(emailsOf(store, String(args.accountId)), [
    { property: "receivedAt", isAscending: true },
  ]);
  const ids = (args.ids ?? []) as string[];
  const list = ids
    .map((id) => ({
      id,
      emailIds: emails.filter((email) => email.threadId === id).map((email) => email.id),
    }))
    .filter((thread) => thread.emailIds.length);
  return {
    accountId: args.accountId,
    state: state(store),
    list,
    notFound: ids.filter((id) => !list.some((thread) => thread.id === id)),
  };
};

// Email/set

/** A patch (RFC 8620 §5.3): whole properties, or "keywords/$seen" one level down. */
export const applyPatch = (email: StoredEmail, patch: Args): StoredEmail => {
  const next: StoredEmail = { ...email };
  for (const [path, value] of Object.entries(patch)) {
    const [property, key] = path.split("/") as [string, string | undefined];
    if (key === undefined) {
      next[property] = value;
      continue;
    }
    const { [key]: _, ...rest } = (next[property] ?? {}) as Record<string, unknown>;
    next[property] = value === null ? rest : { ...rest, [key]: value };
  }
  return next;
};

/** The parts of a mail as the composer sends it (src/lib/mail-structure.ts), with part ids. */
const partsOf = (store: Store, structure: Args, values: Record<string, { value: string }>) => {
  let counter = 0;
  const build = (node: Args): Part => {
    const subParts = node.subParts ? (node.subParts as Args[]).map(build) : null;
    const partId = subParts ? null : String(node.partId ?? ++counter);
    const blobId = (node.blobId as string | undefined) ?? null;
    return {
      partId,
      blobId,
      type: String(node.type),
      name: (node.name as string | undefined) ?? null,
      size: blobId
        ? (store.blobs.get(blobId)?.size ?? 0)
        : new TextEncoder().encode(values[partId ?? ""]?.value ?? "").length,
      cid: (node.cid as string | undefined) ?? null,
      disposition: (node.disposition as string | undefined) ?? null,
      subParts,
    };
  };
  const tree = build(structure);
  const leaves = (part: Part): Part[] => (part.subParts ? part.subParts.flatMap(leaves) : [part]);
  const all = leaves(tree);
  const textPart = all.find((part) => part.type === "text/plain" && !part.blobId);
  const htmlPart = all.find((part) => part.type === "text/html" && !part.blobId);
  return {
    bodyStructure: tree,
    textBody: textPart ? [textPart] : [],
    htmlBody: htmlPart ? [htmlPart] : textPart ? [textPart] : [],
    attachments: all.filter((part) => part.blobId),
  };
};

/** A new mail from Email/set `create`: the composer's draft or sent mail. */
const emailOfCreate = (store: Store, accountId: string, value: Args): StoredEmail => {
  const values = (value.bodyValues ?? {}) as Record<string, { value: string }>;
  const parts = value.bodyStructure
    ? partsOf(store, value.bodyStructure as Args, values)
    : partsOf(store, { partId: "text", type: "text/plain" }, values);
  const now = new Date().toISOString();
  const id = newId(store, "mail-");
  const messageId = (value.messageId as string[] | undefined) ?? [`${id}@demo.kontext`];
  const textValue = values[parts.textBody[0]?.partId ?? ""]?.value ?? "";
  const known = [
    ...((value.inReplyTo ?? []) as string[]),
    ...((value.references ?? []) as string[]),
  ];
  const thread = [...store.emails.values()].find(
    (email) => email.accountId === accountId && email.messageId?.some((own) => known.includes(own)),
  );
  return {
    ...EMPTY_HEADERS,
    from: null,
    to: null,
    cc: null,
    bcc: null,
    replyTo: null,
    subject: null,
    inReplyTo: null,
    references: null,
    ...value,
    id,
    accountId,
    blobId: `blob-message-${id}`,
    threadId: thread?.threadId ?? `thread-${id}`,
    mailboxIds: resolveMailboxIds(value.mailboxIds as Record<string, boolean>),
    keywords: (value.keywords ?? {}) as Record<string, boolean>,
    receivedAt: (value.receivedAt as string | undefined) ?? now,
    sentAt: now,
    messageId,
    preview: previewOf(textValue),
    hasAttachment: parts.attachments.some((part) => part.disposition !== "inline"),
    size: parts.bodyStructure.size + parts.attachments.reduce((sum, part) => sum + part.size, 0),
    bodyValues: Object.fromEntries(
      Object.entries(values).map(([key, part]) => [key, { value: part.value, isTruncated: false }]),
    ),
    ...parts,
  };
};

const resolveMailboxIds = (ids: Record<string, boolean> | undefined) => ({ ...(ids ?? {}) });

export const emailSet = (store: Store, args: Args, created: Created): Result => {
  const accountId = String(args.accountId);
  const createdOut: Result = {};
  for (const [key, value] of Object.entries((args.create ?? {}) as Record<string, Args>)) {
    const email = emailOfCreate(store, accountId, value);
    store.emails.set(email.id, email);
    created.set(key, email.id);
    createdOut[key] = {
      id: email.id,
      blobId: email.blobId,
      threadId: email.threadId,
      size: email.size,
    };
  }
  const updated: Result = {};
  const notUpdated: Result = {};
  for (const [rawId, patch] of Object.entries((args.update ?? {}) as Record<string, Args>)) {
    const id = resolveId(rawId, created) ?? rawId;
    const email = store.emails.get(id);
    if (!email) {
      notUpdated[rawId] = { type: "notFound" };
      continue;
    }
    store.emails.set(id, applyPatch(email, patch));
    updated[id] = null;
  }
  const destroyed: string[] = [];
  const notDestroyed: Result = {};
  for (const id of (args.destroy ?? []) as string[]) {
    if (store.emails.delete(id)) destroyed.push(id);
    else notDestroyed[id] = { type: "notFound" };
  }
  changed(store);
  return {
    accountId,
    newState: state(store),
    created: createdOut,
    updated,
    destroyed,
    notCreated: {},
    notUpdated,
    notDestroyed,
  };
};

/** Email/copy into another account; the originals go with `onSuccessDestroyOriginal`. */
export const emailCopy = (store: Store, args: Args): [Result, Result | null] => {
  const accountId = String(args.accountId);
  const createdOut: Result = {};
  const originals: string[] = [];
  for (const [key, value] of Object.entries((args.create ?? {}) as Record<string, Args>)) {
    const original = store.emails.get(String(value.id));
    if (!original) continue;
    const id = newId(store, "mail-");
    store.emails.set(id, {
      ...original,
      ...value,
      id,
      accountId,
      threadId: `thread-${id}`,
      mailboxIds: value.mailboxIds as Record<string, boolean>,
      keywords: (value.keywords ?? original.keywords) as Record<string, boolean>,
    });
    originals.push(original.id);
    createdOut[key] = { id };
  }
  changed(store);
  const copy = {
    fromAccountId: args.fromAccountId,
    accountId,
    newState: state(store),
    created: createdOut,
    notCreated: {},
  };
  if (!args.onSuccessDestroyOriginal) return [copy, null];
  for (const id of originals) store.emails.delete(id);
  return [
    copy,
    {
      accountId: args.fromAccountId,
      newState: state(store),
      destroyed: originals,
      notDestroyed: {},
    },
  ];
};
