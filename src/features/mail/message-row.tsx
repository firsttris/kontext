/**
 * One mail in the list: who, when, subject, categories, preview; and its box to pick it. Picking
 * also works with Shift/Ctrl on the line and, on phones, by a long press. On phones the line can
 * be swiped to the left or right (what that does is set per device).
 */
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
import type { MouseEvent } from "react";
import { Highlighted } from "@/components/highlighted";
import { useLongPress } from "@/components/use-long-press";
import { useMediaQuery } from "@/components/use-media-query";
import { useSwipe } from "@/components/use-swipe";
import { isFlagged, isUnread } from "@/jmap/mail";
import { categoriesOn } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { displayName, formatAddressList, listDate } from "@/lib/format";
import { encryptedPreview } from "@/lib/pgp-mail";
import { sendTimeLabel } from "@/lib/schedule";
import { rowClick } from "@/lib/selection";
import { directionOf, type SwipeAction } from "@/lib/swipe";
import { tasksOfMail } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { CategoryChips } from "../categories/category-chips";
import { useCategoryMap } from "../categories/queries";
import { useTasks } from "../tasks/queries";
import { AssignmentChip } from "./assignment";
import { ExternalMark } from "./external-mark";
import type { Row } from "./list-frame";
import { type DraggedMail, startMailDrag } from "./mail-drag";
import { useOpenedPreview, useShownSubject } from "./opened-mails";
import { SwipeBackdrop } from "./swipe-backdrop";
import { useSwipeSettings } from "./swipe-settings";
import type { Answer, Group } from "./use-thread-info";

export const MessageRow = ({
  row: { email, account, folder, highlight, inAttachment, sendAt, snoozedUntil },
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
  onSwipe,
}: {
  row: Row;
  active: boolean;
  showRecipient: boolean;
  /** A draft opens in the composer to be finished. */
  isDraft: boolean;
  drag: DraggedMail | undefined;
  /** Some mail is picked (or the phone's "Auswählen" is on): every row shows its box, and on a
   *  phone a tap on the line picks. */
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
  /** A swipe on the phone let go far enough. */
  onSwipe: (action: SwipeAction) => void;
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
  const boxShown = selecting || selected;
  const phone = !useMediaQuery("(min-width: 768px)");
  const swipes = useSwipeSettings();
  const swipe = useSwipe(swipes, onSwipe);
  // A long press picks the mail; the finger sliding on afterwards is no swipe any more.
  const pickByPress = useLongPress(() => {
    swipe.handlers.onPointerCancel();
    onPick(false);
  });
  const onClick = (event: MouseEvent) => {
    // Both are asked, so neither keeps a stale "swallow the next click". Only a finger's click
    // ends a press or a swipe: after a drag the browser sends none, and Enter (detail 0) must
    // still open the line.
    const pressed = pickByPress.consumeClick();
    const swiped = swipe.consumeClick();
    if ((swiped || pressed) && event.detail > 0) return event.preventDefault();
    const does = rowClick({
      shift: event.shiftKey,
      ctrl: event.ctrlKey || event.metaKey,
      picking: selecting,
      phone,
    });
    if (does === "open") return;
    event.preventDefault();
    onPick(does === "range");
  };
  return (
    <div className="relative overflow-hidden rounded-[10px]">
      {swipe.offset ? (
        <SwipeBackdrop
          action={swipes[directionOf(swipe.offset)]}
          side={directionOf(swipe.offset)}
          unread={unread}
          flagged={isFlagged(email)}
        />
      ) : null}
      <div
        className={cn(
          "group relative flex rounded-[10px] hover:bg-hover",
          active && "bg-subtle",
          selected && "bg-accent/8",
          swipe.offset !== 0 && "bg-bg",
        )}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
      >
        {/* Its own column the height of the line, beside the link: a click a bit off the box
          still picks and never opens the mail. On phones it is there while picking. */}
        {/* A click on the box itself bubbles here too; a label would not hand on a Shift-click
          beside the box to it. */}
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the checkbox inside is the control */}
        {/* biome-ignore lint/a11y/useKeyWithClickEvents: Space on the checkbox clicks it, which bubbles here */}
        <div
          onClick={(event) => onPick(event.shiftKey)}
          className={cn(
            "w-9 shrink-0 cursor-pointer justify-end pt-[15px] pl-1",
            boxShown ? "flex" : "hidden md:flex",
          )}
        >
          <input
            type="checkbox"
            checked={selected}
            readOnly
            aria-label={m.mail_select({ subject: subject || m.mail_no_subject() })}
            className={cn(
              "size-4 cursor-pointer accent-[var(--primary)]",
              // A faint box on every line says that mails can be picked; full on hover.
              !boxShown && "opacity-35 group-hover:opacity-100 focus-visible:opacity-100",
            )}
          />
        </div>
        <Link
          to="."
          search={(prev) => ({
            ...prev,
            email: email.id,
            account: account?.id,
            compose: isDraft ? "draft" : undefined,
          })}
          aria-current={active ? "true" : undefined}
          draggable={drag && !phone ? true : undefined}
          onDragStart={
            drag && !phone
              ? (event) => startMailDrag(event, drag)
              : (event) => event.preventDefault()
          }
          onClick={onClick}
          {...pickByPress.handlers}
          onPointerDown={(event) => {
            pickByPress.handlers.onPointerDown(event);
            swipe.handlers.onPointerDown(event);
          }}
          onPointerMove={(event) => {
            pickByPress.handlers.onPointerMove(event);
            swipe.handlers.onPointerMove(event);
          }}
          onPointerUp={(event) => {
            pickByPress.handlers.onPointerUp();
            swipe.handlers.onPointerUp(event);
          }}
          onPointerCancel={() => {
            pickByPress.handlers.onPointerCancel();
            swipe.handlers.onPointerCancel();
          }}
          className={cn(
            "flex min-w-0 flex-1 touch-pan-y py-3 pr-3 text-left text-fg no-underline [-webkit-touch-callout:none]",
            boxShown ? "pl-2" : "pl-3 md:pl-2",
          )}
        >
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex items-baseline gap-2">
              <span className={cn("min-w-0 flex-1 truncate", unread && "font-semibold")}>
                {unread ? (
                  <span
                    aria-hidden="true"
                    className="mr-1.5 mb-px inline-block size-1.5 rounded-full bg-accent align-middle"
                  />
                ) : null}
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
              <ExternalMark address={email.from?.[0]?.email} />
              {sendAt ? (
                <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-warn/10 px-1.5 text-[11px] font-medium text-warn">
                  <CalendarClock size={11} strokeWidth={2.25} aria-hidden="true" />
                  {m.mail_scheduled_at({ when: sendTimeLabel(new Date(sendAt)) })}
                </span>
              ) : null}
              {snoozedUntil ? (
                <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-accent/10 px-1.5 text-[11px] font-medium text-accent-ink">
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
                <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-accent/10 px-1.5 text-[11px] font-medium text-accent-ink">
                  <ListChecks size={11} strokeWidth={2.25} aria-hidden="true" />
                  {m.tasks_from_mail()}
                </span>
              ) : null}
              {inAttachment ? (
                <span className="inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-accent/10 px-1.5 text-[11px] font-medium text-accent-ink">
                  <Paperclip size={11} strokeWidth={2.25} aria-hidden="true" />
                  {m.search_in_attachment()}
                </span>
              ) : null}
              {shared ? <AssignmentChip email={email} compact /> : null}
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
    </div>
  );
};
