/**
 * The month as six weeks: each day with its first appointments, "+2 weitere" for the rest. On a
 * phone the days show dots; tapping a day opens it.
 */
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/cn";
import {
  addDays,
  type CalendarEvent,
  eventKey,
  eventTimes,
  onDay,
  toLocal,
  weekStart,
} from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";
import { calendarColor } from "./event-style";
import { eventSearch } from "./queries";

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const SHOWN = 3;

/** The 42 days of the month grid around a day (Monday before the 1st onwards). */
export const monthDays = (key: string): string[] => {
  const first = weekStart(`${key.slice(0, 7)}-01`);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
};

/** All-day events first, then by start. */
const byStart = (a: CalendarEvent, b: CalendarEvent) => {
  const x = eventTimes(a);
  const y = eventTimes(b);
  return Number(y.allDay) - Number(x.allDay) || x.start.getTime() - y.start.getTime();
};

type Props = {
  selected: string;
  today: string;
  events: CalendarEvent[];
  isInvitation: (event: CalendarEvent) => boolean;
  compact: boolean;
};

export const MonthView = ({ selected, today, events, isInvitation, compact }: Props) => {
  const days = monthDays(selected);
  const month = selected.slice(0, 7);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((day) => (
          <span key={day} className="px-2 py-2 text-[12px] text-muted">
            {day}
          </span>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-y-auto">
        {days.map((day) => {
          const list = events.filter((event) => onDay(event, day)).sort(byStart);
          return (
            <div
              key={day}
              data-month-day={day}
              className={cn(
                "flex min-h-[72px] min-w-0 flex-col gap-0.5 border-r border-b border-border p-1 md:min-h-[96px]",
                day.slice(0, 7) !== month && "bg-side",
              )}
            >
              <Link
                to="/calendar"
                search={(prev) => ({ ...prev, date: day, view: "day" })}
                aria-label={day}
                className={cn(
                  "inline-flex size-6 items-center justify-center self-start rounded-full font-mono text-[12px] no-underline",
                  day === today ? "bg-accent font-semibold text-white" : "text-fg",
                  day.slice(0, 7) !== month && day !== today && "text-muted",
                )}
              >
                {Number(day.slice(8))}
              </Link>
              {compact ? (
                <span className="flex flex-wrap gap-0.5 px-1">
                  {list.slice(0, 4).map((event) => (
                    <span
                      key={eventKey(event)}
                      className="size-1.5 rounded-full bg-[var(--cal)]"
                      style={calendarColor(event)}
                    />
                  ))}
                </span>
              ) : (
                <>
                  {list.slice(0, SHOWN).map((event) => (
                    <MonthChip
                      key={eventKey(event)}
                      event={event}
                      invitation={isInvitation(event)}
                    />
                  ))}
                  {list.length > SHOWN ? (
                    <Link
                      to="/calendar"
                      search={(prev) => ({ ...prev, date: day, view: "day" })}
                      className="px-1.5 text-[11px] text-muted no-underline hover:text-fg"
                    >
                      {m.calendar_more({ count: list.length - SHOWN })}
                    </Link>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const MonthChip = ({ event, invitation }: { event: CalendarEvent; invitation: boolean }) => {
  const { start, allDay } = eventTimes(event);
  return (
    <Link
      to="/calendar"
      search={(prev) => ({ ...prev, ...eventSearch(event) })}
      style={calendarColor(event)}
      className={cn(
        "flex min-w-0 items-baseline gap-1 rounded-md px-1.5 py-px text-[12px] text-fg no-underline",
        allDay ? "bg-[color-mix(in_srgb,var(--cal)_13%,var(--bg))]" : "hover:bg-hover",
        invitation && "border border-dashed border-muted",
      )}
    >
      {allDay ? null : (
        <span className="shrink-0 font-mono text-[11px] text-muted">
          {toLocal(start).slice(11, 16)}
        </span>
      )}
      <span className="truncate">{event.title || "—"}</span>
    </Link>
  );
};
