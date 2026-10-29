/**
 * The calendar: on the desktop day, week, month or list with a sidebar (month, calendars, open
 * invitations); on a phone one day with a strip of the week above it, the month, or the list.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
import { useState } from "react";
import { TabBar, useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useMediaQuery } from "@/components/use-media-query";
import { useShortcuts } from "@/components/use-shortcuts";
import { cn } from "@/lib/cn";
import { movePatch } from "@/lib/event-form";
import {
  addDays,
  addMonths,
  type CalendarEvent,
  dateKey,
  eventTimes,
  isoWeek,
  toLocal,
  weekDays,
} from "@/lib/jscalendar";
import { LOCALE } from "@/lib/locale";
import { calendarTasks } from "@/lib/task-context";
import { m } from "@/paraglide/messages";
import { useMe, useTasks } from "../tasks/queries";
import { AGENDA_DAYS, AgendaView } from "./agenda-view";
import { CalendarList, CalendarsDialog } from "./calendar-list";
import { EventDialog } from "./event-dialog";
import { MiniMonth } from "./mini-month";
import { MonthView, monthDays } from "./month-view";
import { calendarOf, isInvitation, mayEdit, useEventMutations, useEvents } from "./queries";
import { useTasksShown } from "./task-chip";
import type { Moved } from "./use-drag";
import { WeekGrid } from "./week-grid";

type View = "day" | "week" | "month" | "agenda";
type Search = {
  date?: string;
  view?: View;
  event?: string;
  account?: string;
  start?: string;
};

const VIEWS: [View, () => string][] = [
  ["day", m.calendar_day],
  ["week", m.calendar_week],
  ["month", m.calendar_month],
  ["agenda", m.calendar_agenda],
];

const dayMonth = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});
const longDay = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const monthTitle = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The days a view loads and shows. Day and week both load the week, so switching is instant. */
const range = (view: View, selected: string): { from: string; to: string } => {
  if (view === "month") {
    const days = monthDays(selected);
    return { from: days[0]!, to: days.at(-1)! };
  }
  if (view === "agenda") return { from: selected, to: addDays(selected, AGENDA_DAYS - 1) };
  const week = weekDays(selected);
  return { from: week[0]!, to: week[6]! };
};

const move = (view: View, selected: string, direction: 1 | -1): string => {
  if (view === "month") return addMonths(selected, direction);
  return addDays(selected, direction * { day: 1, week: 7, agenda: AGENDA_DAYS }[view]);
};

const rangeTitle = (days: string[]): string => {
  const first = new Date(`${days[0]}T12:00:00Z`);
  const last = new Date(`${days.at(-1)}T12:00:00Z`);
  if (days.length === 1) return longDay.format(first);
  return first.getUTCMonth() === last.getUTCMonth()
    ? `${first.getUTCDate()}.–${dayMonth.format(last)}`
    : `${dayMonth.format(first)} – ${dayMonth.format(last)}`;
};

const useIsPhone = (): boolean => useMediaQuery("(max-width: 767px)");

export const CalendarPage = ({ search }: { search: Search }) => {
  const today = dateKey(new Date());
  const selected = search.date ?? today;
  const phone = useIsPhone();
  // A phone has no room for seven columns: the week becomes the day.
  const chosen = search.view ?? (phone ? "day" : "week");
  const view: View = phone && chosen === "week" ? "day" : chosen;
  const week = weekDays(selected);
  const days = view === "day" ? [selected] : week;
  const { from, to } = range(view, selected);
  const { data: events, calendars, isPending } = useEvents(from, to);
  const [managing, setManaging] = useState(false);
  const me = useMe();
  const { tasks: allTasks } = useTasks();
  const tasks = useTasksShown() ? calendarTasks(allTasks, me, today) : [];
  const { data: session } = useSession();
  const mine = session ? [session.username] : [];
  const { move: moveEvent } = useEventMutations();
  const toast = useToast();
  const navigate = useNavigate();
  const go = (patch: Partial<Search>) =>
    void navigate({ to: "/calendar", search: (prev) => ({ ...prev, ...patch }) });
  useShortcuts({
    c: () => go({ event: "new", start: `${selected}T09:00` }),
    t: () => go({ date: undefined }),
    left: () => go({ date: move(view, selected, -1) }),
    right: () => go({ date: move(view, selected, 1) }),
    d: () => go({ view: "day" }),
    w: phone ? undefined : () => go({ view: "week" }),
    m: () => go({ view: "month" }),
    l: () => go({ view: "agenda" }),
  });

  const canMove = (event: CalendarEvent) =>
    mayEdit(calendarOf(calendars, event), event, mine) && !eventTimes(event).allDay;
  const onMove = ({ event, start, end, resized }: Moved) =>
    moveEvent.mutate(
      {
        event,
        start,
        end,
        patch: movePatch(event, start, resized ? end : undefined),
      },
      {
        onSuccess: () => toast.show(m.calendar_moved()),
        onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
      },
    );

  const invited = (event: CalendarEvent) => isInvitation(calendars, event, mine);
  const invitations = events.filter(invited);
  const inAccount = (event: CalendarEvent) => !search.account || event.accountId === search.account;
  // By the shown date's id, or by the stored event's id (the invitation card of a mail links it).
  const open = search.event
    ? (events.find((event) => event.id === search.event && inAccount(event)) ??
      events.find((event) => event.baseEventId === search.event && inAccount(event)))
    : undefined;

  const header = (
    <div className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-2 md:px-5">
      <h1 className="m-0 text-[22px] font-semibold tracking-tight capitalize md:text-[18px]">
        {view === "month"
          ? monthTitle.format(new Date(`${selected.slice(0, 7)}-15T12:00:00Z`))
          : view === "agenda"
            ? rangeTitle([from, to])
            : rangeTitle(days)}
      </h1>
      {view === "day" || view === "week" ? (
        <span className="text-[13px] text-muted">
          {m.calendar_week_number({ week: isoWeek(selected) })}
        </span>
      ) : null}
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="iconSm"
        aria-label={m.calendar_manage()}
        title={m.calendar_manage()}
        onClick={() => setManaging(true)}
        className="lg:hidden"
      >
        <Settings2 size={16} />
      </Button>
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="iconSm" aria-label={m.calendar_prev()}>
          <Link to="/calendar" search={(prev) => ({ ...prev, date: move(view, selected, -1) })}>
            <ChevronLeft size={16} />
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/calendar" search={(prev) => ({ ...prev, date: undefined })}>
            {m.calendar_today()}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="iconSm" aria-label={m.calendar_next()}>
          <Link to="/calendar" search={(prev) => ({ ...prev, date: move(view, selected, 1) })}>
            <ChevronRight size={16} />
          </Link>
        </Button>
      </div>
      <nav
        aria-label="Ansicht"
        className="order-last flex w-full gap-1 rounded-[9px] bg-subtle p-[3px] md:order-none md:w-auto"
      >
        {VIEWS.filter(([value]) => !(phone && value === "week")).map(([value, label]) => (
          <Link
            key={value}
            to="/calendar"
            search={(prev) => ({ ...prev, view: value })}
            aria-current={view === value ? "page" : undefined}
            className={cn(
              "flex h-[30px] flex-1 items-center justify-center rounded-[7px] px-3 text-[13px] no-underline md:h-[26px] md:flex-none",
              view === value ? "bg-bg text-fg shadow-sm" : "text-muted",
            )}
          >
            {label()}
          </Link>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden h-full w-sidebar shrink-0 flex-col gap-6 border-r border-border bg-side p-4 lg:flex">
        <Button asChild variant="primary" className="h-[38px]">
          <Link
            to="/calendar"
            search={(prev) => ({ ...prev, event: "new", start: `${selected}T09:00` })}
          >
            {m.calendar_new()}
          </Link>
        </Button>
        <MiniMonth key={selected.slice(0, 7)} selected={selected} today={today} />
        <CalendarList onManage={() => setManaging(true)} />
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
        {phone && view === "day" ? (
          <DayStrip week={week} selected={selected} today={today} />
        ) : null}
        {isPending ? (
          <p className="px-5 py-3 text-[13px] text-muted">{m.common_loading()}</p>
        ) : null}
        {view === "month" ? (
          <MonthView
            selected={selected}
            today={today}
            events={events}
            tasks={tasks}
            isInvitation={invited}
            compact={phone}
          />
        ) : view === "agenda" ? (
          <AgendaView
            from={from}
            today={today}
            events={events}
            tasks={tasks}
            isInvitation={invited}
          />
        ) : (
          <WeekGrid
            days={days}
            events={events}
            tasks={tasks}
            isInvitation={invited}
            showDayHeader={!phone}
            canMove={canMove}
            onMove={onMove}
          />
        )}
        <Link
          to="/calendar"
          search={(prev) => ({ ...prev, event: "new", start: `${selected}T09:00` })}
          aria-label={m.calendar_new()}
          className="fixed right-5 bottom-[calc(6rem+var(--keyboard-height,0px))] z-30 flex size-14 items-center justify-center rounded-2xl bg-primary text-onprimary shadow-lg md:hidden"
        >
          <Plus size={24} />
        </Link>
        <TabBar />
      </main>
      {search.event ? (
        <EventDialog
          key={`${search.account ?? ""}/${search.event}`}
          eventId={search.event}
          event={open}
          start={search.start}
        />
      ) : null}
      <CalendarsDialog open={managing} onOpenChange={setManaging} />
    </>
  );
};

const weekdayShort = new Intl.DateTimeFormat(LOCALE, { weekday: "short", timeZone: "UTC" });

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
