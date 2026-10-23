/**
 * "Alle Posteingänge": the inboxes of the own account and the shared mailboxes in one list,
 * newest first.
 */
import { useMemo } from "react";
import type { Inbox } from "@/lib/inboxes";
import { m } from "@/paraglide/messages";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
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
  return (
    <MergedList
      sources={sources}
      search={search}
      title={m.mail_all_inboxes()}
      unread={inboxes.reduce((sum, { mailbox }) => sum + mailbox.unreadEmails, 0)}
    />
  );
};
