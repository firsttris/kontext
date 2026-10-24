/**
 * Wiedervorlage: a mail put away until a time waits in the account's snoozed folder (JMAP role
 * "snoozed", IMAP \Snoozed) and comes back to the inbox then – unread, and marked, so the inbox
 * shows it on top ("Wieder vorgelegt") although it arrived long ago.
 */
import { z } from "zod";

export type Snooze = {
  accountId: string;
  emailId: string;
  /** ISO time it comes back. */
  until: string;
  /** Personal account id of who put it away. */
  by: string;
};

/** The keyword of a mail that came back. Category keywords have no dot, so none can clash. */
export const RESURFACED = "kontext.resurfaced";

/** The folder's name when Kontext creates it (shown in German by its role anyway). */
export const SNOOZED_NAME = "Wiedervorlage";

const YEAR_MS = 366 * 86_400_000;

export const snoozeSchema = z.object({
  accountId: z.string().min(1).max(64),
  emailIds: z.array(z.string().min(1).max(64)).min(1).max(500),
  until: z.iso.datetime(),
});

export const unsnoozeSchema = snoozeSchema.omit({ until: true });

/** Ahead, but within a year. */
export const validUntil = (until: Date, now: Date): boolean =>
  until.getTime() > now.getTime() && until.getTime() < now.getTime() + YEAR_MS;

/** JMAP calls in one account; a method error answers undefined. */
export type Call = <T>(calls: unknown[]) => Promise<(T | undefined)[]>;

export type WokenMail = { subject: string | null; from: { name: string | null; email: string }[] };

/**
 * Brings one mail back to the inbox. Null when there is nothing to bring back: the mail is gone,
 * or no longer in the snoozed folder (someone moved it on, by hand or in another app).
 */
export const wake = async (call: Call, snooze: Snooze): Promise<WokenMail | null> => {
  const { accountId, emailId } = snooze;
  const [inbox, snoozed, got] = await call<{
    ids?: string[];
    list?: (WokenMail & { mailboxIds: Record<string, boolean> })[];
  }>([
    ["Mailbox/query", { accountId, filter: { role: "inbox" } }, "i"],
    ["Mailbox/query", { accountId, filter: { role: "snoozed" } }, "s"],
    [
      "Email/get",
      { accountId, ids: [emailId], properties: ["mailboxIds", "subject", "from"] },
      "e",
    ],
  ]);
  const inboxId = inbox?.ids?.[0];
  const snoozedId = snoozed?.ids?.[0];
  const mail = got?.list?.[0];
  if (!inboxId) throw new Error("Kein Posteingang");
  if (!snoozedId || !mail?.mailboxIds[snoozedId]) return null;
  const [set] = await call<{ notUpdated?: Record<string, { description?: string }> }>([
    [
      "Email/set",
      {
        accountId,
        update: {
          [emailId]: {
            [`mailboxIds/${snoozedId}`]: null,
            [`mailboxIds/${inboxId}`]: true,
            "keywords/$seen": null,
            [`keywords/${RESURFACED}`]: true,
          },
        },
      },
      "u",
    ],
  ]);
  const failed = set?.notUpdated?.[emailId];
  if (!set || failed) throw new Error(failed?.description ?? "Email/set");
  return { subject: mail.subject, from: mail.from ?? [] };
};
