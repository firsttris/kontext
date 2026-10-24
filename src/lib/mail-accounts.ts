/** The mail accounts a user sees, and how the app names them. */
import type { Account } from "@/jmap/types";
import { m } from "@/paraglide/messages";

/**
 * A mail account and what it is for the user: the own mailbox, a shared one like info@ (a group
 * they belong to), or the mailbox of a former colleague handed over to them.
 */
export type MailAccount = Account & { kind: "own" | "shared" | "handedOver" };

/** "info@weber-haustechnik.test" → "info@", for badges and the sidebar. */
export const shortAddress = (name: string): string => name.replace(/@.*/, "@");

/** Says whose mailbox this is, for every mailbox but the own one. */
export const mailboxNotice = (account: MailAccount): string | undefined =>
  account.kind === "shared"
    ? m.mail_shared_mailbox({ address: account.name })
    : account.kind === "handedOver"
      ? m.mail_handed_over_mailbox({ address: account.name })
      : undefined;
