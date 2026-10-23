/** The time grid for one or seven days: all-day row, hours, events side by side, now line. */
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  type CalendarEvent,
  dateKey,
  eventTimes,
  layoutDay,
  locationName,
  minutesInDay,
  onDay,
  timeLabel,
} from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";
import { type Moved, useDragEvents } from "./use-drag";

export const HOUR_HEIGHT = 56;

/** The hours of a day as labels, so they can serve as stable keys. */
const HOURS = Array.from({ length: 24 }, (_, hour) => ({ hour, label: timeLabel(hour * 60) }));

const dayName = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });

const useNow = (): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

type Props = {
  days: string[];
  events: CalendarEvent[];
  /** Events the user still has to answer are drawn dashed. */
  isInvitation: (event: CalendarEvent) => boolean;
  /** The row with weekday and date; the phone shows its own strip instead. */
  showDayHeader?: boolean;
  /** Events the user may drag to another time (their own). */
  canMove?: (event: CalendarEvent) => boolean;
  onMove?: (moved: Moved) => void;
};

/** Only events within one day can be dragged; longer ones are changed in the dialog. */
const withinDay = (event: CalendarEvent): boolean => {
  const { start, end } = eventTimes(event);
  return dateKey(start) === dateKey(new Date(end.getTime() - 1));
};

export const WeekGrid = ({
  days,
  events,
  isInvitation,
  showDayHeader = true,
  canMove = () => false,
  onMove = () => {},
}: Props) => {
  const now = useNow();
  const { preview, handlers } = useDragEvents(HOUR_HEIGHT, onMove);
  const dragged = preview ? events.find((event) => event.id === preview.id) : undefined;
  const today = dateKey(now);
  const scroller = useRef<HTMLDivElement>(null);

  // Start at 07:00, where a working day begins.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * HOUR_HEIGHT - 8;
  }, []);

  const columns = `56px repeat(${days.length}, minmax(0, 1fr))`;
  const allDay = days.map((day) =>
    events.filter((event) => eventTimes(event).allDay && onDay(event, day)),
  );
  const hasAllDay = allDay.some((list) => list.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={cn("grid border-b border-border", !showDayHeader && "hidden")}
        style={{ gridTemplateColumns: columns }}
      >
        <span />
        {days.map((day) => {
          const isToday = day === today;
          return (
            <Link
              key={day}
              to="/calendar"
              search={(prev) => ({ ...prev, date: day, view: "day" })}
              className="flex items-baseline gap-1.5 border-l border-border px-2 py-2.5 text-fg no-underline"
            >
              <span className="text-[12px] text-muted">
                {dayName.format(new Date(`${day}T12:00:00Z`)).replace(".", "")}
              </span>
              <span
                className={cn(
                  "inline-flex size-7 items-center justify-center rounded-full text-[16px] font-semibold",
                  isToday && "bg-accent text-white",
                )}
              >
                {Number(day.slice(8))}
              </span>
            </Link>
          );
        })}
      </div>
      {hasAllDay ? (
        <div className="grid border-b border-border" style={{ gridTemplateColumns: columns }}>
          <span className="px-2 py-1.5 text-right text-[11px] text-muted">
            {m.calendar_all_day()}
          </span>
          {allDay.map((list, index) => (
            <div
              key={days[index]}
              className="flex min-w-0 flex-col gap-1 border-l border-border p-1"
            >
              {list.map((event) => (
                <EventChip key={event.id} event={event} invitation={isInvitation(event)} />
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: columns }}>
          <div className="flex flex-col">
            {HOURS.map(({ hour, label }) => (
              <div
                key={label}
                className="-translate-y-[7px] px-2 text-right font-mono text-[11px] text-muted"
                style={{ height: HOUR_HEIGHT }}
              >
                {hour === 0 ? "" : label}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const placed = layoutDay(
              events.filter(
                (event) =>
                  !eventTimes(event).allDay && onDay(event, day) && event.id !== dragged?.id,
              ),
              day,
              24,
            );
            const weekend = [0, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
            return (
              <div
                key={day}
                data-day={day}
                className={cn("relative border-l border-border", weekend && "bg-side")}
                style={{
                  height: 24 * HOUR_HEIGHT,
                  backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px)",
                  backgroundSize: `100% ${HOUR_HEIGHT}px`,
                }}
              >
                {HOURS.map(({ hour, label }) => (
                  <Link
                    key={label}
                    to="/calendar"
                    search={(prev) => ({
                      ...prev,
                      event: "new",
                      start: `${day}T${timeLabel(hour * 60)}`,
                    })}
                    aria-label={`${m.calendar_new()} ${day} ${timeLabel(hour * 60)}`}
                    tabIndex={-1}
                    className="absolute inset-x-0 block hover:bg-hover/60"
                    style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                  />
                ))}
                {placed.map(({ event, top, height, column, columns: count }) => {
                  const movable = canMove(event) && withinDay(event);
                  return (
                    <div
                      key={event.id}
                      className={cn("absolute", movable && "cursor-grab select-none")}
                      style={{
                        top: (top / 60) * HOUR_HEIGHT,
                        height: Math.max((height / 60) * HOUR_HEIGHT - 3, 20),
                        left: `calc(${(column / count) * 100}% + 3px)`,
                        width: `calc(${100 / count}% - 6px)`,
                      }}
                      {...(movable ? handlers(event, day) : {})}
                    >
                      <EventBlock event={event} invitation={isInvitation(event)} />
                      {movable ? (
                        <div
                          data-resize
                          aria-hidden="true"
                          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                        />
                      ) : null}
                    </div>
                  );
                })}
                {dragged && preview?.day === day ? (
                  <div
                    data-testid="drag-preview"
                    className="pointer-events-none absolute right-[3px] left-[3px] z-10 opacity-80 shadow-lg"
                    style={{
                      top: (preview.top / 60) * HOUR_HEIGHT,
                      height: Math.max((preview.height / 60) * HOUR_HEIGHT - 3, 20),
                    }}
                  >
                    <EventBlock
                      event={dragged}
                      invitation={false}
                      times={[preview.top, preview.top + preview.height]}
                    />
                  </div>
                ) : null}
                {day === today ? (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 h-0.5 bg-accent"
                    style={{ top: (minutesInDay(now, day) / 60) * HOUR_HEIGHT }}
                  >
                    <span className="absolute -top-1 -left-[5px] size-2.5 rounded-full bg-accent" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const eventClass = (invitation: boolean) =>
  invitation
    ? "border-[1.5px] border-dashed border-muted bg-bg"
    : "border border-accent/40 bg-accent/12";

const EventBlock = ({
  event,
  invitation,
  times,
}: {
  event: CalendarEvent;
  invitation: boolean;
  /** Minutes from–to while it is dragged. */
  times?: [number, number];
}) => {
  const { start, end } = eventTimes(event);
  const where = locationName(event);
  const from = times?.[0] ?? minutesInDay(start, dateKey(start));
  const to = times?.[1] ?? (minutesInDay(end, dateKey(new Date(end.getTime() - 1))) || 1440);
  return (
    <Link
      to="/calendar"
      search={(prev) => ({ ...prev, event: event.id })}
      draggable={false}
      className={cn(
        "flex h-full flex-col gap-px overflow-hidden rounded-lg px-2 py-1.5 text-fg no-underline",
        eventClass(invitation),
      )}
    >
      <span className="text-[12px] leading-tight font-semibold">{event.title || "—"}</span>
      <span className="font-mono text-[11px] text-muted">
        {timeLabel(from)}–{timeLabel(to)}
      </span>
      {where ? <span className="truncate text-[11px] text-muted">{where}</span> : null}
    </Link>
  );
};

const EventChip = ({ event, invitation }: { event: CalendarEvent; invitation: boolean }) => (
  <Link
    to="/calendar"
    search={(prev) => ({ ...prev, event: event.id })}
    className={cn(
      "truncate rounded-md px-2 py-0.5 text-[12px] font-medium text-fg no-underline",
      eventClass(invitation),
    )}
  >
    {event.title || "—"}
  </Link>
);
