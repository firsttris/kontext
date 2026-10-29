/**
 * Firmenverwaltung → Telefonie → Öffnungszeiten: outside them the phone does not ring in Kontext
 * or at the box; the caller hears the closing greeting and may leave a message (if the mailbox is
 * on). Closed days for holidays and company holidays; the box decides by itself.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { SettingsCard } from "@/features/settings/settings-page";
import { comingHolidays } from "@/lib/holidays";
import { LOCALE } from "@/lib/locale";
import { fromWeek, type Span, toWeek, usualWeek, type WeekRow } from "@/lib/opening-hours";
import { m } from "@/paraglide/messages";
import { companyDay } from "../../../../server/tasks/tasks";
import { type Admin, send, useAdminChange } from "./api";
import { SoundSelect } from "./sounds";

const DAY_LABELS: Record<number, () => string> = {
  1: m.phone_day_monday,
  2: m.phone_day_tuesday,
  3: m.phone_day_wednesday,
  4: m.phone_day_thursday,
  5: m.phone_day_friday,
  6: m.phone_day_saturday,
  0: m.phone_day_sunday,
};

const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const SpanInputs = ({
  span,
  label,
  onChange,
}: {
  span: Span;
  label: string;
  onChange: (span: Span) => void;
}) => (
  <span className="flex items-center gap-1">
    <Input
      type="time"
      aria-label={m.phone_hours_from({ day: label })}
      value={span.from}
      onChange={(event) => onChange({ ...span, from: event.target.value })}
      className="w-[7.5rem]"
    />
    –
    <Input
      type="time"
      aria-label={m.phone_hours_to({ day: label })}
      value={span.to}
      onChange={(event) => onChange({ ...span, to: event.target.value })}
      className="w-[7.5rem]"
    />
  </span>
);

const DayRow = ({ row, onChange }: { row: WeekRow; onChange: (row: WeekRow) => void }) => {
  const label = DAY_LABELS[row.day]!();
  return (
    <div className="flex flex-wrap items-center gap-2 text-[14px]">
      <label className="flex w-28 items-center gap-2">
        <input
          type="checkbox"
          checked={row.open}
          onChange={(event) => onChange({ ...row, open: event.target.checked })}
          className="size-4 accent-[var(--accent)]"
        />
        {label}
      </label>
      {row.open ? (
        <>
          <SpanInputs
            span={row.first}
            label={label}
            onChange={(first) => onChange({ ...row, first })}
          />
          {row.second ? (
            <>
              <SpanInputs
                span={row.second}
                label={m.phone_hours_afternoon({ day: label })}
                onChange={(second) => onChange({ ...row, second })}
              />
              <Button size="sm" variant="ghost" onClick={() => onChange({ ...row, second: null })}>
                {m.phone_hours_no_break()}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange({
                  ...row,
                  first: { ...row.first, to: "12:00" },
                  second: { from: "13:00", to: "17:00" },
                })
              }
            >
              {m.phone_hours_break()}
            </Button>
          )}
        </>
      ) : (
        <span className="text-muted">{m.phone_hours_closed()}</span>
      )}
    </div>
  );
};

export const HoursForm = ({
  hours,
  sounds,
}: {
  hours: Admin["hours"];
  sounds: Admin["sounds"];
}) => {
  const toast = useToast();
  const [enabled, setEnabled] = useState(hours.enabled);
  const [week, setWeek] = useState(hours.open.length ? toWeek(hours.open) : usualWeek());
  const [closedDays, setClosedDays] = useState(hours.closedDays);
  const [greeting, setGreeting] = useState(hours.greeting ?? "");
  const [newDay, setNewDay] = useState("");
  const save = useAdminChange(() =>
    send("PUT", "/hours", {
      enabled,
      open: fromWeek(week),
      closedDays,
      greeting: greeting || null,
    }),
  );
  const addDays = (days: { day: string; name: string }[]) =>
    setClosedDays((current) =>
      [...new Map([...current, ...days].map((entry) => [entry.day, entry])).values()].sort(
        (left, right) => left.day.localeCompare(right.day),
      ),
    );
  return (
    <SettingsCard title={m.phone_hours()} description={m.phone_hours_hint()}>
      <label className="flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        {m.phone_hours_enabled()}
      </label>
      {enabled ? (
        <>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="sr-only">{m.phone_hours()}</legend>
            {week.map((row) => (
              <DayRow
                key={row.day}
                row={row}
                onChange={(next) =>
                  setWeek((current) =>
                    current.map((other) => (other.day === next.day ? next : other)),
                  )
                }
              />
            ))}
          </fieldset>
          <Label>
            {m.phone_hours_greeting()}
            <SoundSelect
              sounds={sounds}
              none={m.phone_hours_no_greeting()}
              value={greeting}
              onChange={(event) => setGreeting(event.target.value)}
            />
          </Label>
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-medium">{m.phone_hours_closed_days()}</span>
            {closedDays.length ? (
              <ul
                aria-label={m.phone_hours_closed_days()}
                className="m-0 flex list-none flex-col gap-1 p-0"
              >
                {closedDays.map((entry) => (
                  <li key={entry.day} className="flex items-center gap-2 text-[14px]">
                    <span className="flex-1">
                      {dayFormat.format(new Date(`${entry.day}T12:00:00`))}
                      {entry.name ? <span className="text-muted"> · {entry.name}</span> : null}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setClosedDays((current) =>
                          current.filter((other) => other.day !== entry.day),
                        )
                      }
                    >
                      {m.phone_sound_remove()}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap items-end gap-2">
              <Label>
                {m.phone_hours_add_day()}
                <Input
                  type="date"
                  value={newDay}
                  onChange={(event) => setNewDay(event.target.value)}
                />
              </Label>
              <Button
                disabled={!newDay}
                onClick={() => {
                  addDays([{ day: newDay, name: "" }]);
                  setNewDay("");
                }}
              >
                {m.phone_hours_add()}
              </Button>
              <Button onClick={() => addDays(comingHolidays(companyDay(new Date())))}>
                {m.phone_hours_holidays()}
              </Button>
            </div>
          </div>
        </>
      ) : null}
      <Button
        variant="primary"
        className="self-start"
        disabled={save.isPending}
        onClick={async () => {
          await save.mutateAsync(undefined);
          toast.show(m.company_saved());
        }}
      >
        {m.company_save()}
      </Button>
    </SettingsCard>
  );
};
