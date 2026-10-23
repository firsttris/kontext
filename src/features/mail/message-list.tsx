/** The middle column for one folder of one account. */
import { useCallback, useMemo } from "react";
import type { Mailbox } from "@/jmap/types";
import { mailboxName } from "@/lib/mailboxes";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { ListFrame } from "./list-frame";
import { useEmailList, useMailAccounts } from "./queries";

type Props = { accountId: string; mailbox: Mailbox; search: MailSearch };

export const MessageList = ({ accountId, mailbox, search }: Props) => {
  const accounts = useMailAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const filter = useMemo(
    () => ({ mailboxId: mailbox.id, unreadOnly: search.unread }),
    [mailbox.id, search.unread],
  );
  const list = useEmailList(accountId, filter);
  const rows = useMemo(
    () => list.data?.pages.flatMap((page) => page.emails.map((email) => ({ email }))) ?? [],
    [list.data],
  );
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const onNearEnd = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <ListFrame
      title={mailboxName(mailbox)}
      subtitle={account && !account.isPersonal ? account.name : undefined}
      accountLabel={account?.name ?? ""}
      unread={mailbox.unreadEmails}
      rows={rows}
      isPending={list.isPending}
      isFetchingMore={isFetchingNextPage}
      onNearEnd={onNearEnd}
      search={search}
      showRecipient={mailbox.role === "sent" || mailbox.role === "drafts"}
      isDraft={mailbox.role === "drafts"}
    />
  );
};
