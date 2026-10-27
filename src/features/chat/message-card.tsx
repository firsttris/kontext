/**
 * A mail, task, contact or document shared in a message. Whoever may open it gets a link (a task shows its
 * current status); everyone else sees what it is about and where it lives, but not the content –
 * unless a mail was shared as a copy, which they read from the card.
 */
import { X } from "lucide-react";
import { useState } from "react";
import { useContacts } from "@/features/contacts/queries";
import { ItemLink, LinkIcon } from "@/features/links/item-link";
import { useMailAccounts } from "@/features/mail/queries";
import { usePrincipals } from "@/features/sharing/queries";
import { useStatusLabel, useTasks } from "@/features/tasks/queries";
import { principalName } from "@/jmap/principals";
import type { Card } from "@/lib/chat-cards";
import { cn } from "@/lib/cn";
import { dateKey } from "@/lib/jscalendar";
import { dueLabel, type Task } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { MailCopyDialog } from "./mail-copy";

const KIND_LABEL = {
  mail: m.chat_card_mail,
  task: m.chat_card_task,
  contact: m.chat_card_contact,
  document: m.chat_card_document,
};

/** Whether this person can open the card, and the live task behind a task card. */
const useCardAccess = (card: Card): { open: boolean; task?: Task } => {
  const accounts = useMailAccounts();
  const { tasks } = useTasks();
  const { data: contacts = [] } = useContacts();
  if (card.kind === "mail") return { open: accounts.some((a) => a.id === card.accountId) };
  // Dokumente decides when it opens: who may not see the file is told there.
  if (card.kind === "document") return { open: true };
  if (card.kind === "task") {
    const task = tasks.find((candidate) => candidate.id === card.ref);
    return { open: Boolean(task), task };
  }
  return {
    open: contacts.some((c) => c.id === card.ref && c.accountId === card.accountId),
  };
};

/** "Liegt im Postfach von Jonas Weber" / "… von info@weber-haustechnik.test". */
const useOwner = (accountId: string): string => {
  const { data: principals = [] } = usePrincipals();
  const owner = principals.find((principal) => principal.id === accountId);
  if (!owner) return "";
  return owner.type === "individual" ? principalName(owner) : (owner.email ?? owner.name);
};

const frame =
  "flex w-full max-w-[460px] items-center gap-3 rounded-xl border bg-bg px-3 py-2.5 text-left text-fg no-underline";

export const MessageCard = ({ card, onRemove }: { card: Card; onRemove?: () => void }) => {
  const { open, task } = useCardAccess(card);
  const [reading, setReading] = useState(false);
  const owner = useOwner(card.accountId);
  const statusLabel = useStatusLabel();
  const today = dateKey(new Date());
  const detail = task
    ? [dueLabel(task.dueDate, task.dueTime, today)].filter(Boolean).join(" · ")
    : card.detail;
  const body = (
    <>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          card.kind === "task" ? "bg-accent/10 text-accent" : "bg-subtle text-muted",
        )}
      >
        <LinkIcon kind={card.kind} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[12px] text-muted">
          {KIND_LABEL[card.kind]()}
          {detail ? ` · ${detail}` : ""}
        </span>
        <span
          className={cn(
            "truncate font-medium",
            task?.status === "done" && "text-muted line-through",
          )}
        >
          {card.label}
        </span>
        {card.copyId && (!open || onRemove) ? (
          <span className="truncate text-[12px] text-accent">{m.chat_card_copy()}</span>
        ) : !open && !onRemove ? (
          <span className="truncate text-[12px] text-muted">
            {owner ? m.chat_card_elsewhere({ owner }) : m.chat_card_not_shared()}
          </span>
        ) : null}
      </span>
      {task ? (
        <span className="shrink-0 rounded-md bg-subtle px-1.5 py-0.5 text-[11px] font-medium text-muted">
          {statusLabel(task)}
        </span>
      ) : null}
    </>
  );
  if (onRemove) {
    return (
      <div className={cn(frame, "border-border")}>
        {body}
        <button
          type="button"
          aria-label={m.chat_card_remove({ label: card.label })}
          onClick={onRemove}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
        >
          <X size={14} />
        </button>
      </div>
    );
  }
  if (!open && card.copyId) {
    return (
      <>
        <button
          type="button"
          onClick={() => setReading(true)}
          className={cn(frame, "border-border hover:bg-hover")}
        >
          {body}
        </button>
        {reading ? <MailCopyDialog copyId={card.copyId} onClose={() => setReading(false)} /> : null}
      </>
    );
  }
  if (!open) return <div className={cn(frame, "border-border")}>{body}</div>;
  return (
    <ItemLink
      item={card}
      className={cn(
        frame,
        "hover:bg-hover",
        card.kind === "task" ? "border-accent/60" : "border-border",
      )}
    >
      {body}
    </ItemLink>
  );
};
