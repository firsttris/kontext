/** The middle column for one folder of one account. */
import { Users } from "lucide-react";
import { useCallback, useMemo } from "react";
import type { Mailbox } from "@/jmap/types";
import { mailboxNotice } from "@/lib/mail-accounts";
import { mailboxName, mailboxRights } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { RESURFACED, useSnoozes } from "../snooze/queries";
import { canEmpty, EmptyFolder } from "./empty-folder";
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
  // In the inbox, what came back from Wiedervorlage and is not read yet: on top, by itself.
  const isInbox = mailbox.role === "inbox";
  const backFilter = useMemo(
    () => ({
      search: {
        operator: "AND",
        conditions: [
          { inMailbox: mailbox.id },
          { hasKeyword: RESURFACED },
          { notKeyword: "$seen" },
        ],
      },
    }),
    [mailbox.id],
  );
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
    const backRows = isInbox ? (back.data?.pages.flatMap((page) => page.emails) ?? []) : [];
    if (!backRows.length) return listed;
    const ids = new Set(backRows.map((email) => email.id));
    const rest = listed.filter((row) => !ids.has(row.email.id));
    return [
      ...backRows.map((email, index) => ({
        email,
        section: index === 0 ? m.mail_resurfaced() : undefined,
      })),
      ...rest.map((row, index) =>
        index === 0 ? { ...row, section: m.mail_resurfaced_rest() } : row,
      ),
    ];
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
      folderAction={
        canEmpty(mailbox) ? <EmptyFolder accountId={accountId} mailbox={mailbox} /> : undefined
      }
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
      empty={scheduled ? m.mail_scheduled_empty() : isSnoozed ? m.mail_snoozed_empty() : undefined}
    />
  );
};
