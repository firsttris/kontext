/** The reading pane: actions, header, body, attachments and the reply buttons. */
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ChevronLeft,
  FolderInput,
  Forward,
  MailOpen,
  MoreHorizontal,
  Reply,
  ReplyAll,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useRef } from "react";
import { useClient } from "@/auth/auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useShortcuts } from "@/components/use-shortcuts";
import { isFlagged, isUnread } from "@/jmap/mail";
import type { BodyPart, EmailDetail, Mailbox } from "@/jmap/types";
import { displayName, firstName, formatAddressList, formatSize, readingDate } from "@/lib/format";
import {
  flattenTree,
  folderTree,
  mailboxName,
  mailboxRights,
  systemMailboxes,
} from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";
import { MailBody } from "./mail-body";
import { useEmail, useEmailActions, useMailboxes } from "./queries";

type Props = { accountId: string; mailbox: Mailbox; emailId: string | undefined };

export const MessageView = ({ accountId, mailbox, emailId }: Props) => {
  const { data: email, isPending } = useEmail(accountId, emailId);
  const actions = useEmailActions(accountId);
  const markedFor = useRef<string | null>(null);

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Toolbar accountId={accountId} mailbox={mailbox} email={email} />
      <article className="flex min-h-0 flex-1 justify-center overflow-y-auto">
        <div className="flex w-full max-w-[780px] flex-col gap-[18px] px-5 pt-5 pb-8 md:px-6">
          <header className="flex flex-col gap-3">
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
              </div>
              <span className="hidden shrink-0 text-[13px] text-muted sm:block">
                {readingDate(email.receivedAt)}
              </span>
            </div>
          </header>
          <MailBody accountId={accountId} email={email} />
          <Attachments
            accountId={accountId}
            parts={email.attachments.filter(
              (part) => !part.cid || part.disposition === "attachment",
            )}
          />
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

const Toolbar = ({
  accountId,
  mailbox,
  email,
}: {
  accountId: string;
  mailbox: Mailbox;
  email: EmailDetail;
}) => {
  const actions = useEmailActions(accountId);
  const navigate = useNavigate();
  const toast = useToast();
  const { data: mailboxes = [] } = useMailboxes(accountId);
  const close = () =>
    navigate({ to: ".", search: (prev) => ({ ...prev, email: undefined, compose: undefined }) });

  const run = async (action: () => Promise<unknown>, leave: boolean) => {
    try {
      if (leave) await close();
      await action();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const targets = [
    ...systemMailboxes(mailboxes).filter((box) => box.role !== "drafts" && box.role !== "flagged"),
    ...flattenTree(folderTree(mailboxes)).map((node) => node.mailbox),
  ].filter((box) => box.id !== mailbox.id);
  const flagged = isFlagged(email);
  const { canRemove, canMarkSeen, canFlag } = mailboxRights(mailbox);
  const compose = (mode: "reply" | "replyAll" | "forward") =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, compose: mode }) });
  useShortcuts({
    r: () => compose("reply"),
    a: () => compose("replyAll"),
    f: () => compose("forward"),
    e:
      canRemove && mailbox.role !== "archive"
        ? () => void run(() => actions.archive([email.id], mailbox.id), true)
        : undefined,
    "#": canRemove ? () => void run(() => actions.remove([email.id], mailbox.id), true) : undefined,
    s: canFlag ? () => void run(() => actions.setFlagged([email.id], !flagged), false) : undefined,
    U: canMarkSeen ? () => void run(() => actions.setSeen([email.id], false), true) : undefined,
    esc: () => void close(),
  });

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 md:px-3">
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.mail_back()}
        className="md:hidden"
        onClick={() => close()}
      >
        <ChevronLeft size={20} />
      </Button>
      {canRemove && mailbox.role !== "archive" ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.mail_archive_action()}
          title={m.mail_archive_action()}
          onClick={() => run(() => actions.archive([email.id], mailbox.id), true)}
        >
          <Archive size={16} strokeWidth={1.75} />
        </Button>
      ) : null}
      {canRemove ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.mail_delete()}
          title={m.mail_delete()}
          onClick={() => run(() => actions.remove([email.id], mailbox.id), true)}
        >
          <Trash2 size={16} strokeWidth={1.75} />
        </Button>
      ) : null}
      {canMarkSeen ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.mail_mark_unread()}
          title={m.mail_mark_unread()}
          onClick={() => run(() => actions.setSeen([email.id], false), true)}
        >
          <MailOpen size={16} strokeWidth={1.75} />
        </Button>
      ) : null}
      {canFlag ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={flagged ? m.mail_unflag() : m.mail_flag()}
          aria-pressed={flagged}
          title={flagged ? m.mail_unflag() : m.mail_flag()}
          onClick={() => run(() => actions.setFlagged([email.id], !flagged), false)}
        >
          <Star
            size={16}
            strokeWidth={1.75}
            className={flagged ? "fill-warn text-warn" : undefined}
          />
        </Button>
      ) : null}
      {canRemove ? (
        <MenuRoot>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={m.mail_move()} title={m.mail_move()}>
              <FolderInput size={16} strokeWidth={1.75} />
            </Button>
          </MenuTrigger>
          <MenuContent align="start">
            <MenuLabel>{m.mail_move()}</MenuLabel>
            {targets.map((target) => (
              <MenuItem
                key={target.id}
                onSelect={() => run(() => actions.move([email.id], mailbox.id, target.id), true)}
              >
                {mailboxName(target)}
              </MenuItem>
            ))}
          </MenuContent>
        </MenuRoot>
      ) : null}
      <div className="flex-1" />
      <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
        <Link to="." search={(prev) => ({ ...prev, compose: "reply" })}>
          <Reply size={15} /> {m.mail_reply()}
        </Link>
      </Button>
      <MenuRoot>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={m.mail_more()}>
            <MoreHorizontal size={16} />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem
            onSelect={() =>
              navigate({ to: ".", search: (prev) => ({ ...prev, compose: "reply" }) })
            }
          >
            <Reply size={15} /> {m.mail_reply()}
          </MenuItem>
          <MenuItem
            onSelect={() =>
              navigate({ to: ".", search: (prev) => ({ ...prev, compose: "replyAll" }) })
            }
          >
            <ReplyAll size={15} /> {m.mail_reply_all()}
          </MenuItem>
          <MenuItem
            onSelect={() =>
              navigate({ to: ".", search: (prev) => ({ ...prev, compose: "forward" }) })
            }
          >
            <Forward size={15} /> {m.mail_forward()}
          </MenuItem>
          {canMarkSeen ? (
            <>
              <MenuSeparator />
              <MenuItem onSelect={() => run(() => actions.setSeen([email.id], false), true)}>
                <MailOpen size={15} /> {m.mail_mark_unread()}
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </MenuRoot>
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
