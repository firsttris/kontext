/**
 * Stalwart's notifications in the bell (notices.ts): shares with me and others' changes to events
 * in calendars I see. Opening one dismisses it.
 */
import * as Popover from "@radix-ui/react-popover";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CalendarX, Share2 } from "lucide-react";
import type { ReactNode } from "react";
import { listDate } from "@/lib/format";
import { dateKey, eventTimes, toLocal } from "@/lib/jscalendar";
import { type EventChange, eventNow, isGranted } from "@/lib/stalwart-notices";
import { m } from "@/paraglide/messages";
import { dayFormat, row, Section } from "./bell-parts";
import type { useStalwartNotices } from "./notices";

/** Icon, sentence and detail of one of Stalwart's notifications (notices.ts). */
const NoticeContent = ({
  icon,
  heading,
  detail,
}: {
  icon: ReactNode;
  heading: string;
  detail: string;
}) => (
  <>
    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent-ink">
      {icon}
    </span>
    <span className="flex min-w-0 flex-col">
      <span className="font-medium">{heading}</span>
      <span className="truncate text-[12px] text-muted">{detail}</span>
    </span>
  </>
);

const CHANGE_TEXT: Record<EventChange, (args: { name: string; title: string }) => string> = {
  moved: m.notifications_event_moved,
  changed: m.notifications_event_changed,
  cancelled: m.notifications_event_cancelled,
};

export const StalwartNotices = ({
  notices,
  now,
}: {
  notices: ReturnType<typeof useStalwartNotices>;
  now: Date;
}) => {
  const { shared, changed, calendars, dismiss } = notices;
  return (
    <Section title={m.notifications_changes()}>
      {shared.map(({ accountId, notice }) => {
        const calendar = notice.objectType === "Calendar";
        const name = notice.changedBy.name;
        const granted = isGranted(notice);
        const heading = calendar
          ? (granted ? m.notifications_shared_calendar : m.notifications_unshared_calendar)({
              name,
            })
          : (granted ? m.notifications_shared_book : m.notifications_unshared_book)({ name });
        const object = calendars.find(
          (ref) => ref.accountId === notice.objectAccountId && ref.calendar.id === notice.objectId,
        );
        const detail = [object?.name, listDate(notice.created, now)].filter(Boolean).join(" · ");
        const open = () => dismiss("ShareNotification", accountId, notice.id);
        return (
          <Popover.Close asChild key={notice.id}>
            <Link to={calendar ? "/calendar" : "/contacts"} className={row} onClick={open}>
              <NoticeContent icon={<Share2 size={15} />} heading={heading} detail={detail} />
            </Link>
          </Popover.Close>
        );
      })}
      {changed.map(({ accountId, notice, change }) => {
        const event = eventNow(notice);
        const start = event ? eventTimes(event).start : new Date(notice.created);
        const heading = CHANGE_TEXT[change]({
          name: notice.changedBy?.name ?? "—",
          title: event?.title || m.notifications_untitled(),
        });
        const detail = `${dayFormat.format(start)}, ${toLocal(start).slice(11, 16)}`;
        const cancelled = change === "cancelled";
        return (
          <Popover.Close asChild key={`${accountId}/${notice.id}`}>
            <Link
              to="/calendar"
              search={{
                date: dateKey(start),
                event: cancelled ? undefined : (notice.calendarEventId ?? undefined),
                account: cancelled ? undefined : accountId,
              }}
              className={row}
              onClick={() => dismiss("CalendarEventNotification", accountId, notice.id)}
            >
              <NoticeContent
                icon={cancelled ? <CalendarX size={15} /> : <CalendarClock size={15} />}
                heading={heading}
                detail={detail}
              />
            </Link>
          </Popover.Close>
        );
      })}
    </Section>
  );
};
