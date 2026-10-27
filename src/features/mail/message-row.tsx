/** One mail in the list: who, when, subject, categories, preview; and its box to pick it. */
import { Link, useParams } from "@tanstack/react-router";
import {
  AlarmClock,
  CalendarClock,
  CornerUpLeft,
  ListChecks,
  LockKeyhole,
  Paperclip,
  Star,
  Users,
} from "lucide-react";
import { Highlighted } from "@/components/highlighted";
import { isFlagged, isUnread } from "@/jmap/mail";
import { categoriesOn } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { displayName, formatAddressList, listDate } from "@/lib/format";
import { encryptedPreview } from "@/lib/pgp-mail";
import { sendTimeLabel } from "@/lib/schedule";
import { tasksOfMail } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { CategoryChips } from "../categories/category-chips";
import { useCategoryMap } from "../categories/queries";
import { useTasks } from "../tasks/queries";
import type { Row } from "./list-frame";
import { type DraggedMail, startMailDrag } from "./mail-drag";
import { useOpenedPreview, useShownSubject } from "./opened-mails";
import type { Answer, Group } from "./use-thread-info";

export const MessageRow = ({
  row: { email, account, folder, highlight, sendAt, snoozedUntil },
  active,
  showRecipient,
  isDraft,
  drag,
  selecting,
  selected,
  onPick,
  answer,
  shared = false,
  group,
}: {
  row: Row;
  active: boolean;
  showRecipient: boolean;
  /** A draft opens in the composer to be finished. */
  isDraft: boolean;
  drag: DraggedMail | undefined;
  /** Some mail is picked (or the phone's "Auswählen" is on): every row shows its box. */
  selecting: boolean;
  selected: boolean;
  /** Picks or drops the mail; with Shift, the range up to the last one picked. */
  onPick: (shift: boolean) => void;
  /** Who answered it and when (undefined: not answered, or not known yet). */
  answer?: Answer;
  /** In a shared mailbox the answer names the colleague. */
  shared?: boolean;
  /** Grouped as conversations: the conversation this line stands for. */
  group?: Group;
}) => {
  const unread = group ? group.unread : isUnread(email);
  const subject = useShownSubject(email);
  const openedPreview = useOpenedPreview(email.id);
  // Combined lists name each row's account; a folder's list is the route's account.
  const routeAccount = useParams({ strict: false }).accountId;
  const categories = categoriesOn(
    email.keywords,
    useCategoryMap()[account?.id ?? routeAccount ?? ""] ?? [],
  );
  const task = tasksOfMail(useTasks().tasks, email.id, email.threadId).find(
    (candidate) => candidate.status !== "done",
  );
  const who = showRecipient
    ? formatAddressList(email.to)
    : group && group.count > 1
      ? group.names.map((name) => name.split(" ")[0]).join(", ")
      : displayName(email.from?.[0]);
  const boxVisible = selecting || selected;
  return (
    <div className="group relative">
      <label
        className={cn(
          "absolute top-[11px] left-[5px] z-10 flex size-5 cursor-pointer items-center justify-center",
          boxVisible
            ? "flex"
            : "opacity-0 group-hover:opacity-100 has-[:focus-visible]:opacity-100",
        )}
      >
        <input
          type="checkbox"
          checked={selected}
          readOnly
          aria-label={m.mail_select({ subject: subject || m.mail_no_subject() })}
          onClick={(event) => onPick(event.shiftKey)}
          className="size-4 cursor-pointer accent-[var(--primary)]"
        />
      </label>
      <Link
        to="."
        search={(prev) => ({
          ...prev,
          email: email.id,
          account: account?.id,
          compose: isDraft ? "draft" : undefined,
        })}
        aria-current={active ? "true" : undefined}
        draggable={drag ? true : undefined}
        onDragStart={
          drag ? (event) => startMailDrag(event, drag) : (event) => event.preventDefault()
        }
        className={cn(
          "flex gap-3 rounded-[10px] px-3 py-3 text-left text-fg no-underline hover:bg-hover",
          active && "bg-subtle",
          selected && "bg-accent/8",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-[7px] size-1.5 shrink-0 rounded-full",
            unread ? "bg-accent" : "bg-transparent",
            // The box takes the dot's place.
            boxVisible ? "invisible" : "group-hover:invisible",
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-baseline gap-2">
            <span className={cn("min-w-0 flex-1 truncate", unread && "font-semibold")}>
              <Highlighted text={who || "—"} terms={highlight} />
              {group && group.count > 1 ? (
                <>
                  <span
                    aria-hidden="true"
                    className="ml-1.5 font-mono text-[12px] font-normal text-muted"
                  >
                    {group.count}
                  </span>
                  <span className="sr-only">, {m.mail_thread_count({ count: group.count })}</span>
                </>
              ) : null}
            </span>
            {isFlagged(email) ? (
              <Star
                size={12}
                className="shrink-0 fill-warn text-warn"
                aria-label={m.mail_flagged()}
              />
            ) : null}
            <span className="shrink-0 font-mono text-[12px] text-muted">
              {listDate(email.receivedAt, new Date())}
            </span>
          </span>
          <span className={cn("truncate", unread && "font-semibold")}>
            <Highlighted text={subject || m.mail_no_subject()} terms={highlight} />
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted">
            {folder ? (
              <span className="shrink-0 rounded-md border border-border px-1.5 text-[11px] text-muted">
                {folder}
              </span>
            ) : null}
            {account?.label ? (
              <span
                title={account.title}
                className="flex min-w-0 items-center gap-1 rounded-md bg-subtle px-1.5 text-[11px] font-medium text-muted"
              >
                <Users size={11} strokeWidth={2} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{account.label}</span>
              </span>
            ) : null}
            {sendAt ? (
              <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-warn/10 px-1.5 text-[11px] font-medium text-warn">
                <CalendarClock size={11} strokeWidth={2.25} aria-hidden="true" />
                {m.mail_scheduled_at({ when: sendTimeLabel(new Date(sendAt)) })}
              </span>
            ) : null}
            {snoozedUntil ? (
              <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-accent/10 px-1.5 text-[11px] font-medium text-accent">
                <AlarmClock size={11} strokeWidth={2.25} aria-hidden="true" />
                {Date.parse(snoozedUntil) <= Date.now()
                  ? m.mail_snoozed_soon()
                  : m.mail_snoozed_until({ when: sendTimeLabel(new Date(snoozedUntil)) })}
              </span>
            ) : null}
            {email.keywords.$answered ? (
              <span
                title={
                  answer
                    ? m.mail_answered_by({
                        name: answer.name,
                        when: listDate(answer.at, new Date()),
                      })
                    : m.mail_answered()
                }
                className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-muted"
              >
                <CornerUpLeft size={12} strokeWidth={2} aria-label={m.mail_answered()} />
                {shared && answer
                  ? `${answer.name.split(" ")[0]} · ${listDate(answer.at, new Date())}`
                  : null}
              </span>
            ) : null}
            {task ? (
              <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-accent/10 px-1.5 text-[11px] font-medium text-accent">
                <ListChecks size={11} strokeWidth={2.25} aria-hidden="true" />
                {m.tasks_from_mail()}
              </span>
            ) : null}
            <CategoryChips categories={categories} max={2} />
            {encryptedPreview(email.preview, email["header:Content-Type"]) ? (
              <>
                <span className="flex shrink-0 items-center gap-1 text-accent">
                  <LockKeyhole size={12} aria-hidden="true" /> {m.pgp_encrypted()}
                </span>
                {openedPreview ? <span className="truncate">{openedPreview}</span> : null}
              </>
            ) : (
              <>
                {email.hasAttachment ? (
                  <Paperclip size={12} className="shrink-0" aria-label={m.mail_attachments()} />
                ) : null}
                <span className="truncate">
                  <Highlighted text={email.preview} terms={highlight} />
                </span>
              </>
            )}
          </span>
        </span>
      </Link>
    </div>
  );
};
