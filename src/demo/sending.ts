/**
 * Sending in the demo (RFC 8621 §6, §7): identities, submissions held for "Rückgängig" or
 * "Später senden" (the envelope's HOLDFOR/HOLDUNTIL, src/lib/envelope.ts), and delivery – to a
 * colleague or shared mailbox as Stalwart delivers within its domain, to anyone else nowhere.
 */
import { emailSet } from "./emails";
import { roleMailbox } from "./mailboxes";
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
import { accountOf, newId, type Store, type StoredEmail } from "./store";

export type Submission = {
  id: string;
  accountId: string;
  emailId: string;
  sendAt: string;
  undoStatus: "pending" | "final" | "canceled";
};

/** The other accounts' copies: unread in their inboxes, without the Bcc line (RFC 5322 §3.6.3). */
const deliverInside = (store: Store, sent: StoredEmail) => {
  const recipients = ["to", "cc", "bcc"].flatMap(
    (field) => (sent[field] as { email: string }[] | null) ?? [],
  );
  const accounts = new Set(
    recipients.flatMap(({ email }) => {
      const account = store.accounts.find((a) => a.email === email.toLowerCase());
      return account ? [account.id] : [];
    }),
  );
  for (const accountId of accounts) {
    const inbox = roleMailbox(store, accountId, "inbox");
    if (!inbox) continue;
    const id = newId(store, "mail-");
    store.emails.set(id, {
      ...sent,
      id,
      accountId,
      bcc: null,
      threadId: `thread-${id}`,
      mailboxIds: { [inbox.id]: true },
      keywords: {},
      receivedAt: new Date().toISOString(),
    });
  }
};

/** Sends what was held until now; true when anything went. */
export const releaseDue = (store: Store, now = new Date()): boolean => {
  const due = [...store.submissions.values()].filter(
    (submission) => submission.undoStatus === "pending" && new Date(submission.sendAt) <= now,
  );
  for (const submission of due) {
    const email = store.emails.get(submission.emailId);
    if (email) deliverInside(store, email);
    store.submissions.set(submission.id, { ...submission, undoStatus: "final" });
  }
  if (due.length) changed(store);
  return due.length > 0;
};

/** When the envelope says to hold the mail until (RFC 4865 FUTURERELEASE), else now. */
export const sendAtOf = (envelope: Args | undefined, now: Date): Date => {
  const parameters = ((envelope?.mailFrom as Args | undefined)?.parameters ?? {}) as Record<
    string,
    string
  >;
  if (parameters.HOLDUNTIL) return new Date(parameters.HOLDUNTIL);
  if (parameters.HOLDFOR) return new Date(now.getTime() + Number(parameters.HOLDFOR) * 1000);
  return now;
};

export const identityGet = (store: Store, args: Args): Result => {
  const accountId = String(args.accountId);
  const account = accountOf(store, accountId);
  const list = account
    ? [
        {
          id: `identity-${account.id}`,
          name: account.isGroup ? "Weber Haustechnik" : account.fullName,
          email: account.email,
          replyTo: null,
          bcc: null,
          textSignature: "",
          htmlSignature: "",
          mayDelete: false,
        },
      ]
    : [];
  return { accountId, state: state(store), list, notFound: [] };
};

const submissionsOf = (store: Store, accountId: string) =>
  [...store.submissions.values()].filter((submission) => submission.accountId === accountId);

export const submissionGet = (store: Store, args: Args): Result => ({
  accountId: args.accountId,
  state: state(store),
  ...getList(submissionsOf(store, String(args.accountId)), args, (submission) => submission),
});

export const submissionQuery = (store: Store, args: Args): Result => {
  const undoStatus = (args.filter as Args | undefined)?.undoStatus;
  const ids = submissionsOf(store, String(args.accountId))
    .filter((submission) => !undoStatus || submission.undoStatus === undoStatus)
    .map((submission) => submission.id);
  return {
    accountId: args.accountId,
    queryState: state(store),
    canCalculateChanges: false,
    position: 0,
    ids,
    total: ids.length,
  };
};

/** Taking a held mail back: only while it is still held ("cannotUnsend" after). */
const cancel = (store: Store, updates: Record<string, Args>) => {
  const updated: Result = {};
  const notUpdated: Result = {};
  for (const [id, patch] of Object.entries(updates)) {
    const submission = store.submissions.get(id);
    if (submission?.undoStatus === "pending" && patch.undoStatus === "canceled") {
      store.submissions.set(id, { ...submission, undoStatus: "canceled" });
      updated[id] = null;
    } else {
      notUpdated[id] = { type: "cannotUnsend" };
    }
  }
  return { updated, notUpdated };
};

/**
 * EmailSubmission/set: sends, or holds until `sendAt`; then the update the app asks for on
 * success – out of Drafts into Sent (RFC 8621 §7.5).
 */
export const submissionSet = (store: Store, args: Args, created: Created): Result[] => {
  const accountId = String(args.accountId);
  const now = new Date();
  const createdOut: Result = {};
  const sentEmails = new Map<string, string>();
  for (const [key, value] of Object.entries((args.create ?? {}) as Record<string, Args>)) {
    const emailId = resolveId(String(value.emailId), created);
    const email = emailId ? store.emails.get(emailId) : undefined;
    if (!email) continue;
    const sendAt = sendAtOf(value.envelope as Args | undefined, now);
    const held = sendAt > now;
    const id = newId(store, "submission-");
    store.submissions.set(id, {
      id,
      accountId,
      emailId: email.id,
      sendAt: sendAt.toISOString(),
      undoStatus: held ? "pending" : "final",
    });
    if (!held) deliverInside(store, email);
    created.set(key, id);
    sentEmails.set(`#${key}`, email.id);
    createdOut[key] = { id, sendAt: sendAt.toISOString(), undoStatus: held ? "pending" : "final" };
  }
  const { updated, notUpdated } = cancel(store, (args.update ?? {}) as Record<string, Args>);
  changed(store);
  const submission = {
    accountId,
    newState: state(store),
    created: createdOut,
    updated,
    notCreated: {},
    notUpdated,
  };
  const onSuccess = (args.onSuccessUpdateEmail ?? {}) as Record<string, Args>;
  const update = Object.fromEntries(
    Object.entries(onSuccess).flatMap(([key, patch]) => {
      const emailId = sentEmails.get(key);
      return emailId ? [[emailId, patch]] : [];
    }),
  );
  if (!Object.keys(update).length) return [submission];
  return [submission, emailSet(store, { accountId, update }, created)];
};

export const quotaGet = (store: Store, args: Args): Result => {
  const used = emailsOf(store, String(args.accountId)).reduce(
    (sum, email) => sum + Number(email.size),
    0,
  );
  return {
    accountId: args.accountId,
    state: state(store),
    list: [
      {
        id: "octets",
        resourceType: "octets",
        used,
        hardLimit: 5 * 1024 ** 3,
        scope: "account",
        name: "Speicher",
        types: ["Email"],
      },
    ],
    notFound: [],
  };
};
