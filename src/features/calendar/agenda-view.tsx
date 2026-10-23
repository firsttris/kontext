/** The coming appointments as a list, grouped by day – handy on a phone. */
import { Link } from "@tanstack/react-router";
import { Repeat } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  addDays,
  type CalendarEvent,
  eventKey,
  eventTimes,
  isInstance,
  locationName,
  onDay,
  toLocal,
} from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";
import { calendarColor } from "./event-style";
import { eventSearch } from "./queries";

export const AGENDA_DAYS = 30;

const dayTitle = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

type Props = {
  from: string;
  today: string;
  events: CalendarEvent[];
  isInvitation: (event: CalendarEvent) => boolean;
};

export const AgendaView = ({ from, today, events, isInvitation }: Props) => {
  const days = Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(from, i))
    .map((day) => ({
      day,
      list: events
        .filter((event) => onDay(event, day))
        .sort((a, b) => eventTimes(a).start.getTime() - eventTimes(b).start.getTime()),
    }))
    .filter(({ list }) => list.length > 0);

  if (days.length === 0)
    return <p className="px-5 py-6 text-[14px] text-muted">{m.calendar_agenda_empty()}</p>;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ol aria-label={m.calendar_agenda()} className="m-0 list-none p-0">
        {days.map(({ day, list }) => (
          <li key={day} className="border-b border-border px-4 py-3 md:px-5">
            <h2
              className={cn(
                "m-0 mb-2 text-[13px] font-semibold",
                day === today ? "text-accent" : "text-muted",
              )}
            >
              {dayTitle.format(new Date(`${day}T12:00:00Z`))}
            </h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {list.map((event) => (
                <li key={eventKey(event)}>
                  <AgendaItem event={event} invitation={isInvitation(event)} />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
};

const AgendaItem = ({ event, invitation }: { event: CalendarEvent; invitation: boolean }) => {
  const { start, end, allDay } = eventTimes(event);
  const where = locationName(event);
  return (
    <Link
      to="/calendar"
      search={(prev) => ({ ...prev, ...eventSearch(event) })}
      className="flex items-start gap-3 rounded-lg px-2 py-1.5 text-fg no-underline hover:bg-hover"
    >
      <span className="w-[92px] shrink-0 font-mono text-[12px] text-muted">
        {allDay
          ? m.calendar_all_day()
          : `${toLocal(start).slice(11, 16)}–${toLocal(end).slice(11, 16)}`}
      </span>
      <span
        aria-hidden="true"
        style={calendarColor(event)}
        className={cn(
          "mt-1 size-2 shrink-0 rounded-full",
          invitation ? "border border-dashed border-muted" : "bg-[var(--cal)]",
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-1.5 text-[14px] font-medium">
          <span className="truncate">{event.title || "—"}</span>
          {isInstance(event) ? (
            <Repeat size={12} className="shrink-0 text-muted" aria-label={m.calendar_repeat()} />
          ) : null}
        </span>
        {where ? <span className="truncate text-[12px] text-muted">{where}</span> : null}
      </span>
    </Link>
  );
};
