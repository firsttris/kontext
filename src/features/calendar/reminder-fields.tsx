/** "Erinnerung" in the event editor: when before the start, and as a notice or a mail. */
import { Label, Select } from "@/components/ui/input";
import { timeLabel } from "@/lib/jscalendar";
import { type ReminderAction, type ReminderChoice, reminderMinutes } from "@/lib/reminders";
import { m } from "@/paraglide/messages";

/** "15 Minuten vorher", "1 Tag vorher"; whole weeks, days and hours where they fit. */
const beforeLabel = (minutes: number): string => {
  if (minutes === 0) return m.calendar_reminder_at_start();
  if (minutes < 0) return m.calendar_reminder_after({ count: -minutes });
  const [one, many, size] =
    minutes % 10080 === 0
      ? [m.calendar_reminder_week, m.calendar_reminder_weeks, 10080]
      : minutes % 1440 === 0
        ? [m.calendar_reminder_day, m.calendar_reminder_days, 1440]
        : minutes % 60 === 0
          ? [m.calendar_reminder_hour, m.calendar_reminder_hours, 60]
          : [m.calendar_reminder_minute, m.calendar_reminder_minutes, 1];
  const count = minutes / size;
  return count === 1 ? one() : many({ count });
};

/** All day: "Am Tag", "1 Tag vorher"; the time only when it is not the usual 9:00. */
const allDayLabel = (minutes: number): string => {
  const days = Math.max(0, Math.ceil(minutes / 1440));
  const time = days * 1440 - minutes;
  const day = days === 0 ? m.calendar_reminder_on_day() : beforeLabel(days * 1440);
  return time === 540 ? day : m.calendar_reminder_at_time({ when: day, time: timeLabel(time) });
};

export const reminderLabel = (minutes: number, allDay: boolean): string =>
  allDay ? allDayLabel(minutes) : beforeLabel(minutes);

type Props = {
  value: ReminderChoice;
  allDay: boolean;
  onChange: (value: ReminderChoice) => void;
  /** The field's name; "Erinnerung" by default. */
  label?: string;
  /** What no reminder is called; "Keine" by default. */
  noneLabel?: string;
  /** The name of "Erinnern per", where two of these stand together. */
  howLabel?: string;
};

export const ReminderFields = ({ value, allDay, onChange, label, noneLabel, howLabel }: Props) => {
  const action: ReminderAction = value && value !== "kept" ? value.action : "display";
  const selected = value === "kept" ? "kept" : value ? String(value.minutes) : "none";
  const pick = (choice: string) =>
    onChange(
      choice === "none" ? null : choice === "kept" ? "kept" : { minutes: Number(choice), action },
    );
  return (
    <div className="flex gap-2">
      <Label className="flex-1">
        {label ?? m.calendar_reminder()}
        <Select value={selected} onChange={(e) => pick(e.target.value)}>
          <option value="none">{noneLabel ?? m.calendar_reminder_none()}</option>
          {value === "kept" ? <option value="kept">{m.calendar_reminder_kept()}</option> : null}
          {reminderMinutes(value, allDay).map((minutes) => (
            <option key={minutes} value={minutes}>
              {reminderLabel(minutes, allDay)}
            </option>
          ))}
        </Select>
      </Label>
      {value && value !== "kept" ? (
        <Label className="flex-1">
          <span aria-hidden={howLabel ? true : undefined}>{m.calendar_reminder_how()}</span>
          <Select
            aria-label={howLabel}
            value={value.action}
            onChange={(e) => onChange({ ...value, action: e.target.value as ReminderAction })}
          >
            <option value="display">{m.calendar_reminder_display()}</option>
            <option value="email">{m.calendar_reminder_email()}</option>
          </Select>
        </Label>
      ) : null}
    </div>
  );
};
