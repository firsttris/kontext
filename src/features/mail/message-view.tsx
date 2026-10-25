/** The reading pane: toolbar, header, sender check, body, attachments and the reply buttons. */
import { Link } from "@tanstack/react-router";
import { ChevronDown, ListChecks, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/components/use-media-query";
import { displayBody, isUnread } from "@/jmap/mail";
import type { Mailbox } from "@/jmap/types";
import { categoriesOn } from "@/lib/categories";
import { displayName, firstName, formatAddressList, readingDate } from "@/lib/format";
import { mailboxNotice } from "@/lib/mail-accounts";
import { mailboxRights } from "@/lib/mailboxes";
import { pgpKind } from "@/lib/pgp-mail";
import { smimeKind } from "@/lib/smime";
import { tasksOfMail } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { CategoryChips } from "../categories/category-chips";
import { useCategories } from "../categories/queries";
import { DiscussedNotice } from "../chat/discussed-notice";
import { AutocryptCollector } from "../pgp/autocrypt";
import { EncryptedMail, SignedNote } from "../pgp/pgp-mail";
import { SmimeMail, SmimeSignedNote } from "../smime/smime-mail";
import { RESURFACED } from "../snooze/queries";
import { SnoozeNotice } from "../snooze/snooze-notice";
import { useStatusLabel, useTasks } from "../tasks/queries";
import { useEmailActions } from "./actions";
import { Attachments } from "./attachments";
import { EarlierMails, LaterMails } from "./conversation";
import { MailBody } from "./mail-body";
import { MessageDetails, SenderWarnings } from "./message-details";
import { Toolbar } from "./message-toolbar";
import { useEmail, useMailAccounts } from "./queries";
import { ReceiptRequest, ReceiptsReceived } from "./receipts";
import { ScheduledNotice } from "./scheduled-notice";
import { SenderPanel } from "./sender-panel";
import { TransportNote } from "./transport-note";
import { UnsubscribeButton } from "./unsubscribe";

type Props = { accountId: string; mailbox: Mailbox; emailId: string | undefined };

export const MessageView = ({ accountId, mailbox, emailId }: Props) => {
  const { data: email, isPending } = useEmail(accountId, emailId);
  const actions = useEmailActions(accountId);
  const markedFor = useRef<string | null>(null);
  const account = useMailAccounts().find((candidate) => candidate.id === accountId);
  const notice = account ? mailboxNotice(account) : undefined;
  // Open for one mail; the next mail starts folded again.
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const wide = useMediaQuery("(min-width: 1536px)");
  const accountCategories = useCategories(accountId);
  const { tasks } = useTasks();
  const statusLabel = useStatusLabel();

  // Opening a mail marks it read, once per mail (if the mailbox allows it).
  const { canMarkSeen } = mailboxRights(mailbox);
  useEffect(() => {
    if (canMarkSeen && email && isUnread(email) && markedFor.current !== email.id) {
      markedFor.current = email.id;
      void actions.setSeen([email.id], true);
      // Read, a mail back from Wiedervorlage takes its place by date again.
      if (email.keywords[RESURFACED]) {
        void actions.setCategory([email.id], RESURFACED, false).catch(() => undefined);
      }
    }
  }, [canMarkSeen, email, actions]);

  if (!emailId) {
    return (
      <div className="flex flex-1 items-center justify-center text-[14px] text-muted">
        {m.mail_pick()}
      </div>
    );
  }
  if (isPending) return <div className="p-6 text-[14px] text-muted">{m.common_loading()}</div>;
  if (!email) return <div className="p-6 text-[14px] text-muted">{m.mail_pick()}</div>;
  const showDetails = detailsFor === email.id;
  const pgp = pgpKind(email.contentType, displayBody(email).value);
  const smime = smimeKind(email.contentType);
  // Signed with the content inside (not beside) the signature: no body of its own.
  const smimeWrapped =
    smime === "encrypted" ||
    (smime === "signed" && !/multipart\/signed/i.test(email.contentType ?? ""));
  const categories = categoriesOn(email.keywords, accountCategories);
  const mailTasks = tasksOfMail(tasks, email.id, email.threadId);
  const attachments = email.attachments.filter(
    (part) => !part.cid || part.disposition === "attachment",
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar accountId={accountId} mailbox={mailbox} email={email} />
      <div className="flex min-h-0 flex-1">
        {/* Left-aligned with the toolbar; the column stays narrow enough to read (about 70 characters). */}
        <article className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="flex w-full max-w-[780px] flex-col gap-[18px] px-5 pt-5 pb-8 md:px-6 xl:px-8">
            <header className="flex flex-col gap-3">
              {notice && account ? (
                <p
                  title={m.mail_shared_mailbox_hint({ address: account.name })}
                  className="m-0 flex max-w-full items-center gap-1.5 self-start rounded-md bg-subtle px-2 py-1 text-[12px] text-muted"
                >
                  <Users size={13} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
                  <span className="truncate">{notice}</span>
                </p>
              ) : null}
              <h2 className="m-0 text-[21px] leading-snug font-semibold tracking-tight">
                {email.subject || m.mail_no_subject()}
              </h2>
              {mailTasks.map((task) => (
                <Link
                  key={task.id}
                  to="/tasks"
                  search={{ task: task.id }}
                  className="-mt-1 flex items-center gap-2 self-start rounded-lg border border-border px-2.5 py-1.5 text-[13px] text-fg no-underline hover:bg-hover"
                >
                  <ListChecks size={14} className="text-accent" aria-hidden="true" />
                  <span className={task.status === "done" ? "text-muted line-through" : undefined}>
                    {m.tasks_on_mail_open({ title: task.title })}
                  </span>
                  <span className="rounded-md bg-subtle px-1.5 text-[11px] font-medium text-muted">
                    {statusLabel(task)}
                  </span>
                </Link>
              ))}
              <DiscussedNotice emailId={email.id} threadId={email.threadId ?? null} />
              {categories.length ? (
                <div className="-mt-1 flex flex-wrap gap-1">
                  <CategoryChips categories={categories} />
                </div>
              ) : null}
              <EarlierMails accountId={accountId} email={email} />
              <div className="flex items-center gap-3">
                <Avatar name={displayName(email.from?.[0])} size={38} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{displayName(email.from?.[0])}</span>
                  <span className="truncate text-[13px] text-muted">
                    {email.from?.[0]?.email} → {formatAddressList(email.to)}
                    {email.cc?.length ? `, Cc: ${formatAddressList(email.cc)}` : ""}
                  </span>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3">
                    <button
                      type="button"
                      aria-expanded={showDetails}
                      onClick={() => setDetailsFor(showDetails ? null : email.id)}
                      className="flex items-center gap-1 text-[12px] text-muted hover:text-fg"
                    >
                      <ChevronDown
                        size={13}
                        aria-hidden="true"
                        className={showDetails ? "rotate-180" : undefined}
                      />
                      {showDetails ? m.mail_details_hide() : m.mail_details_show()}
                    </button>
                    <TransportNote received={email.received} />
                    <UnsubscribeButton accountId={accountId} mailboxId={mailbox.id} email={email} />
                  </div>
                </div>
                <span className="hidden shrink-0 text-[13px] text-muted sm:block">
                  {readingDate(email.receivedAt)}
                </span>
              </div>
            </header>
            <ScheduledNotice accountId={accountId} emailId={email.id} />
            {mailbox.role === "snoozed" ? (
              <SnoozeNotice
                accountId={accountId}
                emailId={email.id}
                canChange={mailboxRights(mailbox).canRemove}
              />
            ) : null}
            <SenderWarnings email={email} />
            <AutocryptCollector email={email} />
            {mailbox.role === "sent" ? (
              <ReceiptsReceived accountId={accountId} email={email} />
            ) : (
              <ReceiptRequest accountId={accountId} email={email} />
            )}
            {showDetails ? <MessageDetails email={email} attachments={attachments} /> : null}
            {pgp === "encrypted" ? (
              <EncryptedMail accountId={accountId} email={email} />
            ) : smimeWrapped ? (
              <SmimeMail accountId={accountId} email={email} encrypted={smime === "encrypted"} />
            ) : (
              <>
                {pgp === "signed" ? <SignedNote accountId={accountId} email={email} /> : null}
                {smime === "signed" ? (
                  <SmimeSignedNote accountId={accountId} email={email} />
                ) : null}
                <MailBody accountId={accountId} email={email} />
                <Attachments accountId={accountId} parts={attachments} />
              </>
            )}
            <LaterMails accountId={accountId} email={email} />
            <div className="flex flex-wrap gap-2">
              <Button
                asChild
                variant="outline"
                className="h-10 basis-full justify-start rounded-[10px] font-normal text-muted sm:min-w-[200px] sm:flex-1 sm:basis-auto"
              >
                <Link to="." search={(prev) => ({ ...prev, compose: "reply" })}>
                  {m.mail_reply_to({ name: firstName(email.from?.[0]) })}
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-10 flex-1 rounded-[10px] sm:flex-none">
                <Link to="." search={(prev) => ({ ...prev, compose: "replyAll" })}>
                  {m.mail_reply_all()}
                </Link>
              </Button>
              <Button asChild variant="outline" className="h-10 flex-1 rounded-[10px] sm:flex-none">
                <Link to="." search={(prev) => ({ ...prev, compose: "forward" })}>
                  {m.mail_forward()}
                </Link>
              </Button>
            </div>
          </div>
        </article>
        {/* Only mounted when there is room (2xl), so smaller screens load nothing for it. */}
        {wide ? <SenderPanel accountId={accountId} email={email} /> : null}
      </div>
    </div>
  );
};
