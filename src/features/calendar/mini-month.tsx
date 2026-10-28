/** The small month in the calendar's sidebar; the shown week is shaded, today filled. */
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { addDays, addMonths, weekDays, weekStart } from "@/lib/jscalendar";

const monthTitle = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export const MiniMonth = ({ selected, today }: { selected: string; today: string }) => {
  const [month, setMonth] = useState(`${selected.slice(0, 7)}-01`);
  const first = weekStart(month);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const week = new Set(weekDays(selected));

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
      <div className="grid grid-cols-7 gap-0.5 text-center text-[12px]">
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
