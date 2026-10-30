/** The middle column for one folder of one account. */
import { Users } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { Mailbox } from "@/jmap/types";
import { acceptsImport } from "@/lib/eml-import";
import { pinResurfaced, resurfacedFilter } from "@/lib/inboxes";
import { mailboxNotice } from "@/lib/mail-accounts";
import { mailboxName, mailboxRights } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { usePersonalAccountId } from "../settings/queries";
import { RESURFACED, useSnoozes } from "../snooze/queries";
import { EmlImportButton, useEmlImport } from "./eml-import";
import { canEmpty, EmptyFolder } from "./empty-folder";
import { FilterChips, ListFrame, type Row } from "./list-frame";
import { useEmailList, useHeldMails, useMailAccounts } from "./queries";
import { useMailSort } from "./sort-setting";
import { useThreadView } from "./thread-view";

type Props = { accountId: string; mailbox: Mailbox; search: MailSearch };

export const MessageList = ({ accountId, mailbox, search }: Props) => {
  const accounts = useMailAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const me = usePersonalAccountId();
  const shared = Boolean(account && !account.isPersonal);
  const assigned = shared && me ? search.assigned : undefined;
  const filter = useMemo(
    () => ({
      mailboxId: mailbox.id,
      unreadOnly: search.unread,
      assignment: assigned && me ? { view: assigned, me } : undefined,
    }),
    [mailbox.id, search.unread, assigned, me],
  );
  const list = useEmailList(accountId, filter, { collapse: useThreadView(), sort: useMailSort() });
  // In the inbox, what came back from Wiedervorlage and is not read yet: on top, by itself.
  const isInbox = mailbox.role === "inbox";
  const backFilter = useMemo(() => resurfacedFilter(mailbox.id, RESURFACED), [mailbox.id]);
  const back = useEmailList(isInbox ? accountId : "", backFilter);
  // On Wiedervorlage: when each comes back, the next first.
  const isSnoozed = mailbox.role === "snoozed";
  const snoozes = useSnoozes(isSnoozed ? accountId : "");
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
    const listed: Row[] =
      list.data?.pages.flatMap((page) =>
        page.emails.map((email) => ({ email, sendAt: sendAt.get(email.id) })),
      ) ?? [];
    if (isSnoozed) {
      const until = (row: Row) => row.snoozedUntil ?? "\uffff";
      return listed
        .map((row) => ({ ...row, snoozedUntil: snoozes.get(row.email.id) }))
        .sort((a, b) => until(a).localeCompare(until(b)));
    }
    const backRows: Row[] = isInbox
      ? (back.data?.pages.flatMap((page) => page.emails.map((email) => ({ email }))) ?? [])
      : [];
    return pinResurfaced(backRows, listed, {
      back: m.mail_resurfaced(),
      rest: m.mail_resurfaced_rest(),
    });
  }, [list.data, held, scheduled, isSnoozed, snoozes, isInbox, back.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  const onNearEnd = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const { canRemove } = mailboxRights(mailbox);
  const dragMail = useCallback(
    (row: Row) => (canRemove ? { accountId, from: mailbox.id, email: row.email } : undefined),
    [canRemove, accountId, mailbox.id],
  );
  const importEml = useEmlImport();
  const onDropFiles = acceptsImport(mailbox)
    ? (files: File[]) => void importEml({ accountId, mailboxId: mailbox.id }, files)
    : undefined;

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
      listAction={<EmlImportButton accountId={accountId} mailbox={mailbox} />}
      onDropFiles={onDropFiles}
      sortable={!scheduled && !isSnoozed}
      folderAction={
        canEmpty(mailbox) ? <EmptyFolder accountId={accountId} mailbox={mailbox} /> : undefined
      }
      filters={
        shared && !isSent ? (
          <FilterChips
            options={[
              {
                label: m.mail_filter_all(),
                on: !search.unread && !assigned,
                set: { unread: undefined, assigned: undefined },
              },
              {
                label: m.mail_filter_unread(),
                on: Boolean(search.unread) && !assigned,
                set: { unread: true, assigned: undefined },
              },
              {
                label: m.mail_filter_mine(),
                on: assigned === "mine",
                set: { unread: undefined, assigned: "mine" },
              },
              {
                label: m.mail_filter_open(),
                on: assigned === "open",
                set: { unread: undefined, assigned: "open" },
              },
            ]}
          />
        ) : isSent ? (
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
      empty={
        scheduled
          ? m.mail_scheduled_empty()
          : isSnoozed
            ? m.mail_snoozed_empty()
            : assigned === "mine"
              ? m.mail_mine_empty()
              : assigned === "open"
                ? m.mail_open_empty()
                : undefined
      }
    />
  );
};
