/** Pieces the planning panel shares on desktop and phone: statuses, the clash line, suggestions. */
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import type { BusyStatus, PersonStatus, Slot } from "@/lib/availability";
import { addDays } from "@/lib/jscalendar";
import { slotLabel, whenLabel } from "@/lib/planning";
import { m } from "@/paraglide/messages";
import type { PlanningRow } from "./use-planning";

export const statusText = (status: PersonStatus, day: string): string => {
  if (status.kind === "free") return m.availability_free();
  if (status.kind === "unknown") return m.availability_unknown();
  const time = whenLabel(status.until, day);
  return status.tentative
    ? m.availability_tentative_until({ time })
    : m.availability_busy_until({ time });
};

export const STATUS_TONE: Record<PersonStatus["kind"], string> = {
  free: "text-ok",
  busy: "text-warn",
  unknown: "text-muted",
};

/** How a busy period is drawn: solid when busy, hatched when tentative. */
export const barStyle = (status: BusyStatus): CSSProperties =>
  status === "tentative"
    ? {
        background: "repeating-linear-gradient(135deg, var(--muted) 0 3px, var(--subtle) 3px 6px)",
      }
    : { background: "var(--muted)" };

const firstName = (row: PlanningRow) => row.name.split(" ")[0] ?? row.name;

const list = new Intl.ListFormat("de", { type: "conjunction" });

/** "Anna ist zu dieser Zeit belegt." or that everyone is free. */
export const clashText = (busy: PlanningRow[]): string => {
  if (!busy.length) return m.availability_all_free();
  const others = busy.filter((row) => !row.isMe);
  if (!others.length) return m.availability_conflict_me();
  const names = list.format(others.map(firstName));
  return others.length === 1
    ? m.availability_conflict({ names })
    : m.availability_conflict_many({ names });
};

export const Clash = ({ busy }: { busy: PlanningRow[] }) => (
  <span
    aria-live="polite"
    className={`inline-flex items-center gap-1.5 text-[13px] ${busy.length ? "text-warn" : "text-ok"}`}
  >
    {busy.length ? <AlertTriangle size={15} aria-hidden="true" /> : null}
    {clashText(busy)}
  </span>
);

export const Suggestions = ({
  slots,
  day,
  onPick,
  size = "sm",
}: {
  slots: Slot[];
  day: string;
  onPick: (slot: Slot) => void;
  size?: "sm" | "md";
}) =>
  slots.length ? (
    <ul
      aria-label={m.availability_suggestions()}
      className="m-0 flex list-none flex-wrap gap-1.5 p-0"
    >
      {slots.map((slot) => (
        <li key={slot.start}>
          <Button size={size} onClick={() => onPick(slot)} className="text-fg">
            {slotLabel(slot, day)}
          </Button>
        </li>
      ))}
    </ul>
  ) : (
    <span className="text-[13px] text-muted">{m.availability_no_suggestion()}</span>
  );

const dayFormat = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

/** "Di., 27.10." for a local day key. */
export const dayTitle = (day: string): string => dayFormat.format(new Date(`${day}T12:00:00Z`));

export const DayNav = ({ day, onDay }: { day: string; onDay: (day: string) => void }) => (
  <div className="flex items-center gap-2">
    <Button
      size="iconSm"
      aria-label={m.availability_prev_day()}
      onClick={() => onDay(addDays(day, -1))}
    >
      <ChevronLeft size={16} />
    </Button>
    <span className="min-w-[150px] text-center text-[14px] font-semibold">
      {m.availability_day({ day: dayTitle(day) })}
    </span>
    <Button
      size="iconSm"
      aria-label={m.availability_next_day()}
      onClick={() => onDay(addDays(day, 1))}
    >
      <ChevronRight size={16} />
    </Button>
  </div>
);

/** Hour marks of the span shown: every hour, or every other one where space is short. */
export const hourMarks = (startHour: number, endHour: number, every = 1): number[] =>
  Array.from({ length: endHour - startHour }, (_, i) => startHour + i).filter(
    (hour) => (hour - startHour) % every === 0,
  );
