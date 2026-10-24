/** The middle column for one folder of one account. */
import { Users } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { Mailbox } from "@/jmap/types";
import { mailboxNotice } from "@/lib/mail-accounts";
import { mailboxName, mailboxRights } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { FilterChips, ListFrame, type Row } from "./list-frame";
import { useEmailList, useHeldMails, useMailAccounts } from "./queries";
import { useThreadView } from "./thread-view";

type Props = { accountId: string; mailbox: Mailbox; search: MailSearch };

export const MessageList = ({ accountId, mailbox, search }: Props) => {
  const accounts = useMailAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const filter = useMemo(
    () => ({ mailboxId: mailbox.id, unreadOnly: search.unread }),
    [mailbox.id, search.unread],
  );
  const list = useEmailList(accountId, filter, useThreadView());
  // In Sent, what the server still holds: marked in the list, or on its own ("Geplant").
  const isSent = mailbox.role === "sent";
  const held = useHeldMails(isSent ? accountId : "");
  const scheduled = isSent && Boolean(search.scheduled);
  const rows = useMemo((): Row[] => {
    const sendAt = new Map(held.map((mail) => [mail.emailId, mail.sendAt]));
    if (scheduled) {
      return held.flatMap((mail) =>
        mail.email ? [{ email: mail.email, sendAt: mail.sendAt }] : [],
      );
    }
    return (
      list.data?.pages.flatMap((page) =>
        page.emails.map((email) => ({ email, sendAt: sendAt.get(email.id) })),
      ) ?? []
    );
  }, [list.data, held, scheduled]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const onNearEnd = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const { canRemove } = mailboxRights(mailbox);
  const dragMail = useCallback(
    (row: Row) => (canRemove ? { accountId, from: mailbox.id, email: row.email } : undefined),
    [canRemove, accountId, mailbox.id],
  );

  return (
    <ListFrame
      title={mailboxName(mailbox)}
      subtitle={
        account && !account.isPersonal ? (
          // Inline, not flex: a long address is cut with "…" like the rest of the title.
          <span title={mailboxNotice(account)}>
            <Users
              size={13}
              strokeWidth={1.75}
              aria-hidden="true"
              className="mr-1 inline align-[-2px]"
            />
            {account.name}
          </span>
        ) : undefined
      }
      accountLabel={account?.name ?? ""}
      unread={mailbox.unreadEmails}
      rows={rows}
      isPending={list.isPending}
      isFetchingMore={isFetchingNextPage}
      onNearEnd={onNearEnd}
      search={search}
      showRecipient={mailbox.role === "sent" || mailbox.role === "drafts"}
      isDraft={mailbox.role === "drafts"}
      dragMail={dragMail}
      folderId={mailbox.id}
      inJunk={mailbox.role === "junk"}
      filters={
        isSent ? (
          <FilterChips
            options={[
              { label: m.mail_filter_all(), on: !scheduled, set: { scheduled: undefined } },
              {
                label: held.length
                  ? m.mail_filter_scheduled_count({ count: held.length })
                  : m.mail_filter_scheduled(),
                on: scheduled,
                set: { scheduled: true },
              },
            ]}
          />
        ) : undefined
      }
      empty={scheduled ? m.mail_scheduled_empty() : undefined}
    />
  );
};
