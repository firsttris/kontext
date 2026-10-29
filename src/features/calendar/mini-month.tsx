/**
 * The small month in the calendar's sidebar; the shown week is shaded, today filled. One stop for
 * Tab, as the ARIA grid pattern has it: the arrow keys go from day to day (up and down by a week),
 * Page Up and Page Down to the 1st of the month before or after, Enter shows the day.
 */
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { weekdayHeads } from "@/lib/format";
import { addDays, addMonths, weekDays, weekStart } from "@/lib/jscalendar";
import { LOCALE } from "@/lib/locale";

const monthTitle = new Intl.DateTimeFormat(LOCALE, {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const WEEKDAYS = weekdayHeads(LOCALE);
const dayName = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** How far each key moves: days, or months for Page Up and Page Down. */
const MOVES: Record<string, { days?: number; months?: number }> = {
  ArrowLeft: { days: -1 },
  ArrowRight: { days: 1 },
  ArrowUp: { days: -7 },
  ArrowDown: { days: 7 },
  PageUp: { months: -1 },
  PageDown: { months: 1 },
};

/** The day a key moves to from `day`, or null for any other key. */
export const dayAfterKey = (day: string, key: string): string | null => {
  const move = MOVES[key];
  if (!move) return null;
  return move.months ? addMonths(day, move.months) : addDays(day, move.days ?? 0);
};

export const MiniMonth = ({ selected, today }: { selected: string; today: string }) => {
  const [month, setMonth] = useState(`${selected.slice(0, 7)}-01`);
  const first = weekStart(month);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const week = new Set(weekDays(selected));
  // The one day Tab stops at: the one the arrows went to, else the shown day, else the 1st.
  const [current, setCurrent] = useState<string | null>(null);
  // A day shown another way (clicked, or from the URL) is where the arrows start again.
  const [shown, setShown] = useState(selected);
  if (shown !== selected) {
    setShown(selected);
    setCurrent(null);
  }
  const tabStop = [current, selected].find((day) => day && cells.includes(day)) ?? month;
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-mini-day="${tabStop}"]`)?.focus();
  });
  const onKeyDown = (event: KeyboardEvent) => {
    const next = dayAfterKey(tabStop, event.key);
    if (!next) return;
    event.preventDefault();
    moved.current = true;
    setCurrent(next);
    if (next.slice(0, 7) !== month.slice(0, 7)) setMonth(`${next.slice(0, 7)}-01`);
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="font-semibold capitalize">
          {monthTitle.format(new Date(`${month}T12:00:00Z`))}
        </span>
        <span className="flex gap-0.5 text-muted">
          <button
            type="button"
            aria-label="Vorheriger Monat"
            onClick={() => setMonth(addMonths(month, -1))}
            className="flex size-[26px] items-center justify-center rounded-md hover:bg-hover"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            aria-label="Nächster Monat"
            onClick={() => setMonth(addMonths(month, 1))}
            className="flex size-[26px] items-center justify-center rounded-md hover:bg-hover"
          >
            <ChevronRight size={14} />
          </button>
        </span>
      </div>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the arrow keys of the days inside */}
      <div
        ref={grid}
        onKeyDown={onKeyDown}
        className="grid grid-cols-7 gap-0.5 text-center text-[12px]"
      >
        {WEEKDAYS.map((day) => (
          <span key={day} className="py-1 text-muted">
            {day}
          </span>
        ))}
        {cells.map((day) => {
          const inMonth = day.slice(0, 7) === month.slice(0, 7);
          return (
            <Link
              key={day}
              to="/calendar"
              search={(prev) => ({ ...prev, date: day })}
              data-mini-day={day}
              tabIndex={day === tabStop ? 0 : -1}
              aria-label={dayName.format(new Date(`${day}T12:00:00Z`))}
              aria-current={day === today ? "date" : undefined}
              className={cn(
                "flex h-7 items-center justify-center rounded-[7px] font-mono no-underline",
                // Other months' days dimmed as far as WCAG AA's 4.5:1 allows, also on the week's grey (dark: 4.9:1 at 80 %).
                // Not for today: text-white below does not override the dark: variant.
                inMonth || day === today ? "text-fg" : "text-muted dark:text-muted/80",
                week.has(day) && "bg-subtle",
                day === today && "bg-accent-fill font-semibold text-white",
              )}
            >
              {Number(day.slice(8))}
            </Link>
          );
        })}
      </div>
    </div>
  );
};
