/**
 * Phones: the clash with three other times right under the times, a status per attendee, and the
 * day's schedule in a sheet with time running down and one narrow column per attendee.
 */
import { AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { dayBars, type Slot } from "@/lib/availability";
import { slotLabel } from "@/lib/planning";
import { m } from "@/paraglide/messages";
import {
  barStyle,
  Clash,
  clashText,
  DayNav,
  hourMarks,
  STATUS_TONE,
  Suggestions,
  statusText,
} from "./availability-parts";
import { Note } from "./availability-timeline";
import type { Planning, PlanningRow } from "./use-planning";

const DOT: Record<PlanningRow["status"]["kind"], string> = {
  free: "bg-ok",
  busy: "bg-warn",
  unknown: "border-[1.5px] border-muted",
};

export const AvailabilityPhone = ({
  planning,
  onPick,
}: {
  planning: Planning;
  onPick: (slot: Slot) => void;
}) => {
  const [open, setOpen] = useState(false);
  const { rows, busyNow, suggestions, day } = planning;
  return (
    <section aria-label={m.availability_title()} className="flex flex-col gap-2.5">
      {busyNow.length ? (
        <div className="flex items-start gap-2.5 rounded-[10px] border border-noteborder bg-note p-3">
          <AlertTriangle size={18} className="mt-px shrink-0 text-warn" aria-hidden="true" />
          <div className="flex min-w-0 flex-col gap-2">
            <span aria-live="polite" className="text-[14px] text-warn">
              {clashText(busyNow)}
            </span>
            <Suggestions slots={suggestions} day={day} onPick={onPick} size="md" />
          </div>
        </div>
      ) : (
        <Clash busy={busyNow} />
      )}
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted">{m.availability_title()}</span>
        <Button variant="ghost" size="md" className="text-accent" onClick={() => setOpen(true)}>
          {m.availability_schedule()}
        </Button>
      </div>
      <ul className="m-0 flex list-none flex-col rounded-[10px] border border-border p-0">
        {rows.map((row) => (
          <li
            key={row.email}
            className="flex min-h-12 items-center gap-2.5 border-b border-subtle px-3 last:border-b-0"
          >
            <span className={`size-2.5 shrink-0 rounded-full ${DOT[row.status.kind]}`} />
            <span className="min-w-0 flex-1 truncate text-[15px]">
              {row.isMe ? m.availability_me() : row.name}
            </span>
            <span className={`shrink-0 text-[13px] ${STATUS_TONE[row.status.kind]}`}>
              {statusText(row.status, day)}
            </span>
          </li>
        ))}
      </ul>
      <Note planning={planning} />
      {open ? (
        <Schedule
          planning={planning}
          onClose={() => setOpen(false)}
          onPick={(slot) => {
            onPick(slot);
            setOpen(false);
          }}
        />
      ) : null}
    </section>
  );
};

/** Height of one hour in the schedule sheet, in px. */
const HOUR = 40;

const Schedule = ({
  planning,
  onClose,
  onPick,
}: {
  planning: Planning;
  onClose: () => void;
  onPick: (slot: Slot) => void;
}) => {
  const { day, rows, hours, slot, suggestions, dayStartMs } = planning;
  const count = hours.endHour - hours.startHour;
  const span = count * 3_600_000;
  const next = suggestions[0];
  const frame = (from: number, to: number) => ({
    top: Math.max(0, ((from - dayStartMs) / span) * count * HOUR),
    height: Math.max(
      0,
      ((Math.min(to, dayStartMs + span) - Math.max(from, dayStartMs)) / span) * count * HOUR,
    ),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={m.availability_schedule()}>
      <DayNav day={day} onDay={planning.showDay} />
      <div className="flex border-b border-border pb-2 pl-10" aria-hidden="true">
        {rows.map((row) => (
          <span
            key={row.email}
            className={`min-w-0 flex-1 truncate text-center text-[12px] font-semibold ${STATUS_TONE[row.status.kind]}`}
          >
            {row.isMe ? m.availability_me() : row.name.split(" ")[0]}
          </span>
        ))}
      </div>
      <div className="relative" style={{ height: count * HOUR }}>
        {hourMarks(hours.startHour, hours.endHour, 2).map((hour) => (
          <span
            key={hour}
            className="absolute left-0 -translate-y-1/2 text-[11px] text-muted"
            style={{ top: (hour - hours.startHour) * HOUR }}
          >
            {hour}:00
          </span>
        ))}
        <ul
          aria-label={m.availability_title()}
          className="absolute inset-y-0 right-0 left-10 m-0 flex list-none gap-1 p-0"
          style={{
            backgroundImage: "linear-gradient(to bottom, var(--subtle) 1px, transparent 1px)",
            backgroundSize: `100% ${HOUR}px`,
          }}
        >
          {rows.map((row) => (
            <li
              key={row.email}
              aria-label={`${row.isMe ? m.availability_me() : row.name}: ${statusText(row.status, day)}`}
              className={`relative min-w-0 flex-1 ${row.busy ? "" : "rounded border border-dashed border-border"}`}
            >
              {(row.busy ? dayBars(row.busy, day, hours) : []).map((bar, index) => (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: bars of one column never reorder
                  key={index}
                  className="absolute inset-x-0 rounded"
                  style={{
                    top: bar.left * count * HOUR,
                    height: bar.width * count * HOUR,
                    ...barStyle(bar.status),
                  }}
                />
              ))}
            </li>
          ))}
        </ul>
        {slot ? (
          <span
            aria-hidden="true"
            className="absolute right-0 left-9 rounded-md border-2 border-accent bg-accent/10"
            style={frame(slot.start, slot.end)}
          />
        ) : null}
        {next ? (
          <span
            aria-hidden="true"
            className="absolute right-0 left-9 rounded-md border-2 border-dashed border-ok bg-ok/5"
            style={frame(next.start, next.end)}
          />
        ) : null}
      </div>
      {next ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-[13px] text-muted">{m.availability_next_free()}</span>
          <Button variant="primary" size="lg" onClick={() => onPick(next)}>
            {m.availability_take({ slot: slotLabel(next, day) })}
          </Button>
        </div>
      ) : (
        <span className="text-[13px] text-muted">{m.availability_no_suggestion()}</span>
      )}
    </Dialog>
  );
};
