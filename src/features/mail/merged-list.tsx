/**
 * A mail list over several accounts: each account keeps its own paged list (the same cache as its
 * folder view, so read/move/delete update everywhere); the lists are merged here by date.
 */
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { EmailFilter } from "@/jmap/mail";
import { type Feed, mergeFeeds } from "@/lib/inboxes";
import type { MailAccount } from "@/lib/mail-accounts";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { ListFrame, type Row } from "./list-frame";
import type { DraggedMail } from "./mail-drag";
import { useEmailList } from "./queries";

export type Source = { account: MailAccount; filter: EmailFilter };

type Props = {
  sources: Source[];
  search: MailSearch;
  title: string;
  subtitle?: (total: number) => ReactNode;
  unread: number;
  filters?: ReactNode;
  empty?: string;
  /** Adds to each row, e.g. the folder and the words to mark in search results. */
  decorate?: (row: Row) => Row;
  dragMail?: (row: Row) => DraggedMail | undefined;
};

export const MergedList = ({
  sources,
  search,
  title,
  subtitle,
  unread,
  filters,
  empty,
  decorate,
  dragMail,
}: Props) => {
  const [feeds, setFeeds] = useState<Record<string, Feed | undefined>>({});
  const report = useCallback(
    (accountId: string, feed: Feed) => setFeeds((current) => ({ ...current, [accountId]: feed })),
    [],
  );
  const rows = useMemo(() => {
    const merged = mergeFeeds(sources, feeds);
    return decorate ? merged.map(decorate) : merged;
  }, [sources, feeds, decorate]);
  const loaded = sources.map(({ account }) => feeds[account.id]);
  const onNearEnd = useCallback(() => {
    for (const feed of Object.values(feeds)) if (feed?.hasMore && !feed.fetching) feed.fetchMore();
  }, [feeds]);
  const total = loaded.reduce((sum, feed) => sum + (feed?.total ?? 0), 0);

  return (
    <>
      {sources.map(({ account, filter }) => (
        <FeedSource key={account.id} accountId={account.id} filter={filter} report={report} />
      ))}
      <ListFrame
        title={title}
        subtitle={subtitle?.(total)}
        accountLabel={title}
        unread={unread}
        rows={rows}
        isPending={loaded.some((feed) => !feed || feed.pending)}
        isFetchingMore={loaded.some((feed) => feed?.fetching)}
        onNearEnd={onNearEnd}
        search={search}
        showRecipient={false}
        isDraft={false}
        filters={filters}
        empty={empty}
        dragMail={dragMail}
      />
    </>
  );
};

/** Loads one account's list and hands it up; renders nothing. */
const FeedSource = ({
  accountId,
  filter,
  report,
}: {
  accountId: string;
  filter: EmailFilter;
  report: (accountId: string, feed: Feed) => void;
}) => {
  const list = useEmailList(accountId, filter);
  const { data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    report(accountId, {
      emails: data?.pages.flatMap((page) => page.emails) ?? [],
      pending: isPending,
      hasMore: Boolean(hasNextPage),
      fetching: isFetchingNextPage,
      fetchMore: () => void fetchNextPage(),
      total: data?.pages[0]?.total ?? 0,
    });
  }, [accountId, data, isPending, hasNextPage, isFetchingNextPage, fetchNextPage, report]);
  return null;
};
