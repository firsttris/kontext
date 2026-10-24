/**
 * "Alle Posteingänge": the inboxes of the own account and the shared mailboxes in one list,
 * newest first.
 */
import { useCallback, useMemo } from "react";
import type { Inbox } from "@/lib/inboxes";
import { mailboxRights } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import type { Row } from "./list-frame";
import { MergedList } from "./merged-list";

export const UnifiedList = ({ inboxes, search }: { inboxes: Inbox[]; search: MailSearch }) => {
  const sources = useMemo(
    () =>
      inboxes.map(({ account, mailbox }) => ({
        account,
        filter: { mailboxId: mailbox.id, unreadOnly: search.unread },
      })),
    [inboxes, search.unread],
  );
  /** A mail is dragged out of its account's inbox, if that inbox lets one move mails. */
  const dragMail = useCallback(
    (row: Row) => {
      const inbox = inboxes.find(({ account }) => account.id === row.account?.id)?.mailbox;
      return inbox && mailboxRights(inbox).canRemove
        ? { accountId: row.account!.id, from: inbox.id, email: row.email }
        : undefined;
    },
    [inboxes],
  );
  return (
    <MergedList
      sources={sources}
      search={search}
      title={m.mail_all_inboxes()}
      unread={inboxes.reduce((sum, { mailbox }) => sum + mailbox.unreadEmails, 0)}
      dragMail={dragMail}
    />
  );
};
