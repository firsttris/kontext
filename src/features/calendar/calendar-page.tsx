/**
 * The calendar: on the desktop the week with a sidebar (month, calendars, open invitations),
 * on a phone one day with a strip of the week above it.
 */
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { TabBar, useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import {
  addDays,
  type CalendarEvent,
  dateKey,
  eventTimes,
  isOrganizer,
  isoWeek,
  myParticipation,
  toLocal,
  weekDays,
} from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";
import { EventDialog } from "./event-dialog";
import { MiniMonth } from "./mini-month";
import { useCalendars, useEvents } from "./queries";
import { WeekGrid } from "./week-grid";

type Search = { date?: string; view?: "week" | "day"; event?: string; start?: string };

const dayMonth = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const longDay = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const rangeTitle = (days: string[]): string => {
  const first = new Date(`${days[0]}T12:00:00Z`);
  const last = new Date(`${days.at(-1)}T12:00:00Z`);
  if (days.length === 1) return longDay.format(first);
  return first.getUTCMonth() === last.getUTCMonth()
    ? `${first.getUTCDate()}.–${dayMonth.format(last)}`
    : `${dayMonth.format(first)} – ${dayMonth.format(last)}`;
};

const useIsPhone = (): boolean => {
  const query = window.matchMedia("(max-width: 767px)");
  const [phone, setPhone] = useState(query.matches);
  useEffect(() => {
    const update = () => setPhone(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [query]);
  return phone;
};

export const CalendarPage = ({ search }: { search: Search }) => {
  const today = dateKey(new Date());
  const selected = search.date ?? today;
  const phone = useIsPhone();
  const view = phone ? "day" : (search.view ?? "week");
  const week = weekDays(selected);
  const days = view === "day" ? [selected] : week;
  // Always load the whole week, so switching between day and week is instant.
  const { data: events = [], isPending } = useEvents(week[0]!, week[6]!);
  const { data: session } = useSession();
  const mine = session ? [session.username] : [];
  const step = view === "day" ? 1 : 7;

  const isInvitation = (event: CalendarEvent) => {
    const me = myParticipation(event, mine);
    return Boolean(me && !isOrganizer(event, mine) && me[1].participationStatus === "needs-action");
  };
  const invitations = events.filter(isInvitation);
  const open = search.event ? events.find((event) => event.id === search.event) : undefined;

  const header = (
    <div className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2 md:px-5">
      <h1 className="m-0 text-[22px] font-semibold tracking-tight md:text-[18px]">
        {rangeTitle(days)}
      </h1>
      <span className="text-[13px] text-muted">
        {m.calendar_week_number({ week: isoWeek(selected) })}
      </span>
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="iconSm" aria-label={m.calendar_prev()}>
          <Link to="/calendar" search={(prev) => ({ ...prev, date: addDays(selected, -step) })}>
            <ChevronLeft size={16} />
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/calendar" search={(prev) => ({ ...prev, date: undefined })}>
            {m.calendar_today()}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="iconSm" aria-label={m.calendar_next()}>
          <Link to="/calendar" search={(prev) => ({ ...prev, date: addDays(selected, step) })}>
            <ChevronRight size={16} />
          </Link>
        </Button>
      </div>
      <nav aria-label="Ansicht" className="hidden gap-1 rounded-[9px] bg-subtle p-[3px] md:flex">
        {(
          [
            ["day", m.calendar_day()],
            ["week", m.calendar_week()],
          ] as const
        ).map(([value, label]) => (
          <Link
            key={value}
            to="/calendar"
            search={(prev) => ({ ...prev, view: value })}
            aria-pressed={view === value}
            className={cn(
              "flex h-[26px] items-center rounded-[7px] px-3 text-[13px] no-underline",
              view === value ? "bg-bg text-fg shadow-sm" : "text-muted",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden h-full w-[248px] shrink-0 flex-col gap-6 border-r border-border bg-side p-4 lg:flex">
        <Button asChild variant="primary" className="h-[38px]">
          <Link
            to="/calendar"
            search={(prev) => ({ ...prev, event: "new", start: `${selected}T09:00` })}
          >
            {m.calendar_new()}
          </Link>
        </Button>
        <MiniMonth key={selected.slice(0, 7)} selected={selected} today={today} />
        <Calendars />
        {invitations.length > 0 ? (
          <div className="mt-auto flex flex-col gap-2 rounded-xl border border-border bg-bg px-3.5 py-3">
            <span className="text-[12px] text-muted">
              {invitations.length === 1
                ? "1 offene Einladung"
                : `${invitations.length} offene Einladungen`}
            </span>
            {invitations.slice(0, 3).map((event) => (
              <Link
                key={event.id}
                to="/calendar"
                search={(prev) => ({ ...prev, event: event.id })}
                className="flex flex-col text-fg no-underline"
              >
                <span className="font-medium">{event.title}</span>
                <span className="text-[13px] text-muted">
                  {toLocal(eventTimes(event).start).slice(0, 16).replace("T", " ")}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </aside>
      <main className="flex h-full min-w-0 flex-1 flex-col">
        {header}
        {phone ? <DayStrip week={week} selected={selected} today={today} /> : null}
        {isPending ? (
          <p className="px-5 py-3 text-[13px] text-muted">{m.common_loading()}</p>
        ) : null}
        <WeekGrid days={days} events={events} isInvitation={isInvitation} showDayHeader={!phone} />
        <Link
          to="/calendar"
          search={(prev) => ({ ...prev, event: "new", start: `${selected}T09:00` })}
          aria-label={m.calendar_new()}
          className="fixed right-5 bottom-24 z-30 flex size-14 items-center justify-center rounded-2xl bg-primary text-onprimary shadow-lg md:hidden"
        >
          <Plus size={24} />
        </Link>
        <TabBar />
      </main>
      {search.event ? (
        <EventDialog key={search.event} eventId={search.event} event={open} start={search.start} />
      ) : null}
    </>
  );
};

const Calendars = () => {
  const { data: calendars = [] } = useCalendars();
  if (calendars.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12px] font-medium text-muted">{m.calendar_my_calendars()}</span>
      {calendars.map((calendar) => (
        <span key={calendar.id} className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ background: calendar.color ?? "var(--accent)" }}
          />
          {/^Stalwart Calendar/.test(calendar.name) ? m.calendar_mine() : calendar.name}
        </span>
      ))}
    </div>
  );
};

const weekdayShort = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });

/** Phone: the seven days of the week as buttons above the day view. */
const DayStrip = ({
  week,
  selected,
  today,
}: {
  week: string[];
  selected: string;
  today: string;
}) => (
  <nav aria-label={m.calendar_week()} className="flex gap-1 border-b border-border px-3 py-2">
    {week.map((day) => (
      <Link
        key={day}
        to="/calendar"
        search={(prev) => ({ ...prev, date: day })}
        aria-current={day === selected ? "date" : undefined}
        className={cn(
          "flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-fg no-underline",
          day === selected && "bg-primary text-onprimary",
        )}
      >
        <span className={cn("text-[11px]", day === selected ? "text-onprimary/80" : "text-muted")}>
          {weekdayShort.format(new Date(`${day}T12:00:00Z`)).replace(".", "")}
        </span>
        <span
          className={cn(
            "font-mono text-[16px] font-semibold",
            day === today && day !== selected && "text-accent",
          )}
        >
          {Number(day.slice(8))}
        </span>
      </Link>
    ))}
  </nav>
);
