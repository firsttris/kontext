/** Folders (RFC 8621 §2): their counts from the mails in them, every right for the demo's people. */
import {
  type Args,
  type Created,
  changed,
  getList,
  type Result,
  resolveId,
  state,
} from "./methods";
import { newId, type Store, type StoredMailbox } from "./store";

const ALL_RIGHTS = {
  mayReadItems: true,
  mayAddItems: true,
  mayRemoveItems: true,
  maySetSeen: true,
  maySetKeywords: true,
  mayCreateChild: true,
  mayRename: true,
  mayDelete: true,
  maySubmit: true,
};

const mailboxesOf = (store: Store, accountId: string) =>
  [...store.mailboxes.values()].filter((mailbox) => mailbox.accountId === accountId);

/** The account's folder with this role ("inbox", "sent" …). */
export const roleMailbox = (store: Store, accountId: string, role: string) =>
  mailboxesOf(store, accountId).find((mailbox) => mailbox.role === role);

const mailboxObject = (store: Store) => (mailbox: StoredMailbox) => {
  const inside = [...store.emails.values()].filter((email) => email.mailboxIds[mailbox.id]);
  return {
    ...mailbox,
    totalEmails: inside.length,
    unreadEmails: inside.filter((email) => !email.keywords.$seen).length,
    totalThreads: new Set(inside.map((email) => email.threadId)).size,
    unreadThreads: new Set(
      inside.filter((email) => !email.keywords.$seen).map((email) => email.threadId),
    ).size,
    myRights: ALL_RIGHTS,
    isSubscribed: true,
  };
};

export const mailboxGet = (store: Store, args: Args): Result => ({
  accountId: args.accountId,
  state: state(store),
  ...getList(mailboxesOf(store, String(args.accountId)), args, mailboxObject(store)),
});

export const mailboxSet = (store: Store, args: Args, created: Created): Result => {
  const accountId = String(args.accountId);
  const createdOut: Result = {};
  for (const [key, value] of Object.entries((args.create ?? {}) as Record<string, Args>)) {
    const id = newId(store, `${accountId}-folder-`);
    const parentId = resolveId(value.parentId as string | null, created);
    store.mailboxes.set(id, {
      id,
      accountId,
      name: String(value.name),
      parentId: parentId ?? null,
      role: (value.role as string | undefined) ?? null,
      sortOrder: Number(value.sortOrder ?? 10),
    });
    created.set(key, id);
    createdOut[key] = { id };
  }
  const updated: Result = {};
  for (const [id, patch] of Object.entries((args.update ?? {}) as Record<string, Args>)) {
    const mailbox = store.mailboxes.get(id);
    if (!mailbox) continue;
    store.mailboxes.set(id, { ...mailbox, ...(patch as Partial<StoredMailbox>) });
    updated[id] = null;
  }
  const destroyed: string[] = [];
  for (const id of (args.destroy ?? []) as string[]) {
    if (!store.mailboxes.delete(id)) continue;
    for (const email of store.emails.values()) {
      if (!email.mailboxIds[id]) continue;
      const { [id]: _, ...rest } = email.mailboxIds;
      if (Object.keys(rest).length) email.mailboxIds = rest;
      else store.emails.delete(email.id);
    }
    destroyed.push(id);
  }
  changed(store);
  return {
    accountId,
    newState: state(store),
    created: createdOut,
    updated,
    destroyed,
    notCreated: {},
    notUpdated: {},
    notDestroyed: {},
  };
};
