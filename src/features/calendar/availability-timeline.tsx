/**
 * Desktop: one row per attendee with their status at the chosen time and their busy periods of
 * the day as bars, the chosen time framed across all rows (like Outlook's scheduling assistant).
 */
import type { CSSProperties } from "react";
import { dayBars, dayPart, type Slot } from "@/lib/availability";
import { m } from "@/paraglide/messages";
import {
  barStyle,
  Clash,
  DayNav,
  hourMarks,
  STATUS_TONE,
  Suggestions,
  statusText,
} from "./availability-parts";
import type { Planning } from "./use-planning";

/** Width of the name column, in px. */
const NAMES = 180;

/** A part of the hours shown, as a position in the bar area right of the names. */
const across = (fraction: number) => `calc(${NAMES}px + (100% - ${NAMES}px) * ${fraction})`;

export const AvailabilityTimeline = ({
  planning,
  onPick,
}: {
  planning: Planning;
  onPick: (slot: Slot) => void;
}) => {
  const { day, rows, slot, hours, busyNow, suggestions } = planning;
  const selection = slot ? dayPart(slot.start, slot.end, day, hours) : null;

  return (
    <section
      aria-label={m.availability_title()}
      className="overflow-hidden rounded-[10px] border border-border"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border bg-side px-3.5 py-2.5">
        <DayNav day={day} onDay={planning.showDay} />
        <Legend />
      </div>
      <div className="relative px-3.5 pb-2.5">
        <div className="relative h-7" style={{ marginLeft: NAMES }} aria-hidden="true">
          {hourMarks(
            hours.startHour,
            hours.endHour,
            hours.endHour - hours.startHour > 12 ? 2 : 1,
          ).map((hour) => (
            <span
              key={hour}
              className="absolute bottom-1.5 text-[11px] text-muted"
              style={{
                left: `${((hour - hours.startHour) / (hours.endHour - hours.startHour)) * 100}%`,
              }}
            >
              {hour}
            </span>
          ))}
        </div>
        <ul className="relative m-0 list-none p-0">
          {rows.map((row) => (
            <li key={row.email} className="flex h-11 items-center border-t border-subtle">
              <span className="flex min-w-0 flex-col pr-2" style={{ width: NAMES, flex: "none" }}>
                <span className="truncate text-[13px] font-medium">
                  {row.isMe ? m.availability_me() : row.name}
                </span>
                <span className={`truncate text-[12px] ${STATUS_TONE[row.status.kind]}`}>
                  {statusText(row.status, day)}
                </span>
              </span>
              <span
                className="relative h-6 min-w-0 flex-1"
                style={hourLines(hours.endHour - hours.startHour)}
                aria-hidden="true"
              >
                {row.busy ? (
                  dayBars(row.busy, day, hours).map((bar, index) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: bars of one row never reorder
                      key={index}
                      className="absolute inset-y-0 rounded"
                      style={{
                        left: `${bar.left * 100}%`,
                        width: `${bar.width * 100}%`,
                        ...barStyle(bar.status),
                      }}
                    />
                  ))
                ) : (
                  <span className="absolute inset-0 rounded border border-dashed border-border" />
                )}
              </span>
            </li>
          ))}
          {selection ? (
            <span
              aria-hidden="true"
              className="absolute inset-y-0 rounded-md border-2 border-accent bg-accent/10"
              style={{
                left: across(selection.left),
                width: `calc((100% - ${NAMES}px) * ${selection.width})`,
              }}
            />
          ) : null}
        </ul>
      </div>
      <div className="flex flex-col gap-2 border-t border-border px-3.5 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Clash busy={busyNow} pending={planning.isPending} />
          {busyNow.length ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-muted">{m.availability_suggestions()}</span>
              <Suggestions slots={suggestions} day={day} onPick={onPick} />
            </span>
          ) : null}
        </div>
        <Note planning={planning} />
      </div>
    </section>
  );
};

/** A thin line at every hour behind the bars. */
const hourLines = (count: number): CSSProperties => ({
  backgroundImage: "linear-gradient(to right, var(--subtle) 1px, transparent 1px)",
  backgroundSize: `${100 / count}% 100%`,
});

const Legend = () => (
  <span className="flex flex-wrap items-center gap-3.5 text-[12px] text-muted">
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-3.5 rounded-sm" style={barStyle("confirmed")} />
      {m.availability_legend_busy()}
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-3.5 rounded-sm" style={barStyle("tentative")} />
      {m.availability_legend_tentative()}
    </span>
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-3.5 rounded-sm border border-dashed border-muted" />
      {m.availability_legend_unknown()}
    </span>
  </span>
);

export const Note = ({ planning }: { planning: Planning }) =>
  planning.isError ? (
    <p role="alert" className="m-0 text-[12px] text-danger">
      {m.availability_error()}
    </p>
  ) : planning.isPending ? (
    <p className="m-0 text-[12px] text-muted">{m.availability_loading()}</p>
  ) : (
    <p className="m-0 text-[12px] text-muted">{m.availability_note()}</p>
  );
