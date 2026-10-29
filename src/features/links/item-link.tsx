/**
 * A link to something in Kontext by its kind: a mail, task, contact, appointment, chat message,
 * phone call or a file in Dokumente – for task links and chat cards alike.
 */
import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  FileText,
  ListChecks,
  Mail,
  MessagesSquare,
  Phone,
  User,
} from "lucide-react";
import type { ReactNode } from "react";

export type ItemKind = "mail" | "task" | "contact" | "event" | "chat" | "call" | "document";

export type ItemRef = {
  kind: ItemKind;
  /** The account (mailbox, address book, calendar), for chat the channel. */
  accountId: string;
  /** The item; for chat the message. */
  ref: string;
  /** An appointment's day (YYYY-MM-DD), where the calendar opens; a mail's conversation. */
  threadId?: string | null;
};

const ICONS = {
  mail: Mail,
  task: ListChecks,
  contact: User,
  event: CalendarDays,
  chat: MessagesSquare,
  call: Phone,
  document: FileText,
} as const;

export const LinkIcon = ({ kind, size = 16 }: { kind: ItemKind; size?: number }) => {
  const Icon = ICONS[kind];
  return <Icon size={size} aria-hidden="true" />;
};

export const ItemLink = ({
  item,
  className,
  children,
}: {
  item: ItemRef;
  className?: string;
  children: ReactNode;
}) => {
  const { kind, accountId, ref, threadId } = item;
  if (kind === "mail") {
    return (
      <Link
        to="/mail/$accountId/$mailboxId"
        params={{ accountId, mailboxId: "inbox" }}
        search={{ email: ref }}
        className={className}
      >
        {children}
      </Link>
    );
  }
  if (kind === "contact") {
    return (
      <Link to="/contacts" search={{ id: ref, account: accountId }} className={className}>
        {children}
      </Link>
    );
  }
  if (kind === "event") {
    return (
      <Link
        to="/calendar"
        search={{
          event: ref,
          account: accountId,
          ...(threadId && /^\d{4}-\d{2}-\d{2}$/.test(threadId) ? { date: threadId } : {}),
        }}
        className={className}
      >
        {children}
      </Link>
    );
  }
  if (kind === "document") {
    return (
      <Link to="/documents/$" params={{ _splat: `edit/${ref}` }} className={className}>
        {children}
      </Link>
    );
  }
  if (kind === "chat") {
    return (
      <Link to="/chat" search={{ channel: accountId, message: ref }} className={className}>
        {children}
      </Link>
    );
  }
  if (kind === "call") {
    return (
      <Link to="/phone" className={className}>
        {children}
      </Link>
    );
  }
  return (
    <Link to="/tasks" search={{ task: ref }} className={className}>
      {children}
    </Link>
  );
};
