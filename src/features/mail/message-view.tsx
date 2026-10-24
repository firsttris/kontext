/** The reading pane: toolbar, header, sender check, body, attachments and the reply buttons. */
import { Link } from "@tanstack/react-router";
import { ChevronDown, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useClient } from "@/auth/auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { isUnread } from "@/jmap/mail";
import type { BodyPart, Mailbox } from "@/jmap/types";
import { displayName, firstName, formatAddressList, formatSize, readingDate } from "@/lib/format";
import { mailboxNotice } from "@/lib/mail-accounts";
import { mailboxRights } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import { MailBody } from "./mail-body";
import { MessageDetails, SenderWarnings } from "./message-details";
import { Toolbar } from "./message-toolbar";
import { useEmail, useEmailActions, useMailAccounts } from "./queries";

type Props = { accountId: string; mailbox: Mailbox; emailId: string | undefined };

export const MessageView = ({ accountId, mailbox, emailId }: Props) => {
  const { data: email, isPending } = useEmail(accountId, emailId);
  const actions = useEmailActions(accountId);
  const markedFor = useRef<string | null>(null);
  const account = useMailAccounts().find((candidate) => candidate.id === accountId);
  const notice = account ? mailboxNotice(account) : undefined;
  // Open for one mail; the next mail starts folded again.
  const [detailsFor, setDetailsFor] = useState<string | null>(null);

  // Opening a mail marks it read, once per mail (if the mailbox allows it).
  const { canMarkSeen } = mailboxRights(mailbox);
  useEffect(() => {
    if (canMarkSeen && email && isUnread(email) && markedFor.current !== email.id) {
      markedFor.current = email.id;
      void actions.setSeen([email.id], true);
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
  const attachments = email.attachments.filter(
    (part) => !part.cid || part.disposition === "attachment",
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar accountId={accountId} mailbox={mailbox} email={email} />
      <article className="flex min-h-0 flex-1 justify-center overflow-y-auto">
        <div className="flex w-full max-w-[780px] flex-col gap-[18px] px-5 pt-5 pb-8 md:px-6">
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
            <div className="flex items-center gap-3">
              <Avatar name={displayName(email.from?.[0])} size={38} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{displayName(email.from?.[0])}</span>
                <span className="truncate text-[13px] text-muted">
                  {email.from?.[0]?.email} → {formatAddressList(email.to)}
                  {email.cc?.length ? `, Cc: ${formatAddressList(email.cc)}` : ""}
                </span>
                <button
                  type="button"
                  aria-expanded={showDetails}
                  onClick={() => setDetailsFor(showDetails ? null : email.id)}
                  className="mt-0.5 flex items-center gap-1 self-start text-[12px] text-muted hover:text-fg"
                >
                  <ChevronDown
                    size={13}
                    aria-hidden="true"
                    className={showDetails ? "rotate-180" : undefined}
                  />
                  {showDetails ? m.mail_details_hide() : m.mail_details_show()}
                </button>
              </div>
              <span className="hidden shrink-0 text-[13px] text-muted sm:block">
                {readingDate(email.receivedAt)}
              </span>
            </div>
          </header>
          <SenderWarnings email={email} />
          {showDetails ? <MessageDetails email={email} attachments={attachments} /> : null}
          <MailBody accountId={accountId} email={email} />
          <Attachments accountId={accountId} parts={attachments} />
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
    </div>
  );
};

const Attachments = ({ accountId, parts }: { accountId: string; parts: BodyPart[] }) => {
  const client = useClient();
  const toast = useToast();
  if (parts.length === 0) return null;

  const open = async (part: BodyPart) => {
    try {
      const blob = await client.download(accountId, part.blobId!, part.name ?? "anhang", part.type);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = part.name ?? "anhang";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <ul aria-label={m.mail_attachments()} className="m-0 flex list-none flex-wrap gap-3 p-0">
      {parts.map((part) => (
        <li
          key={part.blobId ?? part.partId}
          className="flex w-full max-w-[340px] items-center gap-3 rounded-xl border border-border px-3.5 py-3"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-9 items-center justify-center rounded-md bg-subtle font-mono text-[10px] text-muted uppercase"
          >
            {(part.name?.split(".").pop() ?? part.type.split("/").pop() ?? "").slice(0, 4)}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{part.name ?? part.type}</span>
            <span className="text-[12px] text-muted">{formatSize(part.size)}</span>
          </span>
          <Button size="sm" onClick={() => open(part)}>
            {m.mail_open()}
          </Button>
        </li>
      ))}
    </ul>
  );
};
