/**
 * A link to something in Kontext by its kind: a mail, task, contact, appointment or chat message
 * – for task links and chat cards alike.
 */
import { Link } from "@tanstack/react-router";
import { CalendarDays, ListChecks, Mail, MessagesSquare, User } from "lucide-react";
import type { ReactNode } from "react";

export type ItemKind = "mail" | "task" | "contact" | "event" | "chat";

export type ItemRef = {
  kind: ItemKind;
  /** The account (mailbox, address book, calendar), for chat the channel. */
  accountId: string;
  /** The item; for chat the message. */
  ref: string;
};

const ICONS = {
  mail: Mail,
  task: ListChecks,
  contact: User,
  event: CalendarDays,
  chat: MessagesSquare,
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
  const { kind, accountId, ref } = item;
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
      <Link to="/calendar" search={{ event: ref, account: accountId }} className={className}>
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
  return (
    <Link to="/tasks" search={{ task: ref }} className={className}>
      {children}
    </Link>
  );
};
