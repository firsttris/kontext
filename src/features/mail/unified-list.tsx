/**
 * "Alle Posteingänge": the inboxes of the own account and the shared mailboxes in one list,
 * newest first. Each account keeps its own paged list (the same cache as its folder view, so
 * read/move/delete update both); the lists are merged here.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { type Feed, type Inbox, mergeFeeds } from "@/lib/inboxes";
import { m } from "@/paraglide/messages";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { ListFrame } from "./list-frame";
import { useEmailList } from "./queries";

export const UnifiedList = ({ inboxes, search }: { inboxes: Inbox[]; search: MailSearch }) => {
  const [feeds, setFeeds] = useState<Record<string, Feed | undefined>>({});
  const report = useCallback(
    (accountId: string, feed: Feed) => setFeeds((current) => ({ ...current, [accountId]: feed })),
    [],
  );
  const rows = useMemo(() => mergeFeeds(inboxes, feeds), [inboxes, feeds]);
  const loaded = inboxes.map(({ account }) => feeds[account.id]);
  const onNearEnd = useCallback(() => {
    for (const feed of Object.values(feeds)) if (feed?.hasMore && !feed.fetching) feed.fetchMore();
  }, [feeds]);

  return (
    <>
      {inboxes.map(({ account, mailbox }) => (
        <FeedSource
          key={account.id}
          accountId={account.id}
          mailboxId={mailbox.id}
          search={search}
          report={report}
        />
      ))}
      <ListFrame
        title={m.mail_all_inboxes()}
        accountLabel={m.mail_all_inboxes()}
        unread={inboxes.reduce((sum, { mailbox }) => sum + mailbox.unreadEmails, 0)}
        rows={rows}
        isPending={loaded.some((feed) => !feed || feed.pending)}
        isFetchingMore={loaded.some((feed) => feed?.fetching)}
        onNearEnd={onNearEnd}
        search={search}
        showRecipient={false}
        isDraft={false}
      />
    </>
  );
};

/** Loads one account's inbox and hands it up; renders nothing. */
const FeedSource = ({
  accountId,
  mailboxId,
  search,
  report,
}: {
  accountId: string;
  mailboxId: string;
  search: MailSearch;
  report: (accountId: string, feed: Feed) => void;
}) => {
  const filter = useMemo(
    () => ({ mailboxId, text: search.q, unreadOnly: search.unread }),
    [mailboxId, search.q, search.unread],
  );
  const list = useEmailList(accountId, filter);
  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    report(accountId, {
      emails: data?.pages.flatMap((page) => page.emails) ?? [],
      pending: isPending,
      hasMore: Boolean(hasNextPage),
      fetching: isFetchingNextPage,
      fetchMore: () => void fetchNextPage(),
    });
  }, [accountId, data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage, report]);
  return null;
};
