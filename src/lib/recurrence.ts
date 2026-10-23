/**
 * Repeating events (RFC 8984, section 4.3.3): the few rules people pick in a calendar app, as a
 * JSCalendar `recurrenceRule` and back. Stalwart 0.16 takes the singular `recurrenceRule`.
 */
import { m } from "@/paraglide/messages";

export type RecurrenceRule = {
  "@type"?: "RecurrenceRule";
  frequency: "yearly" | "monthly" | "weekly" | "daily" | "hourly" | "minutely" | "secondly";
  interval?: number;
  byDay?: { "@type"?: "NDay"; day: string; nthOfPeriod?: number }[];
  byMonthDay?: number[];
  count?: number;
  /** Local date-time of the last possible start. */
  until?: string;
};

export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "biweekly" | "monthly" | "yearly";
export type RepeatEnd = "never" | "count" | "until";

export type RepeatForm = {
  repeat: Repeat;
  repeatEnd: RepeatEnd;
  repeatCount: number;
  /** YYYY-MM-DD, the last day an instance may fall on. */
  repeatUntil: string;
};

export const NO_REPEAT: RepeatForm = {
  repeat: "none",
  repeatEnd: "never",
  repeatCount: 10,
  repeatUntil: "",
};

const WEEKDAYS = ["mo", "tu", "we", "th", "fr"];

const nday = (day: string) => ({ "@type": "NDay" as const, day });

const base = (repeat: Repeat): Omit<RecurrenceRule, "count" | "until"> | null => {
  switch (repeat) {
    case "daily":
      return { frequency: "daily" };
    case "weekdays":
      return { frequency: "weekly", byDay: WEEKDAYS.map(nday) };
    case "weekly":
      return { frequency: "weekly" };
    case "biweekly":
      return { frequency: "weekly", interval: 2 };
    case "monthly":
      return { frequency: "monthly" };
    case "yearly":
      return { frequency: "yearly" };
    default:
      return null;
  }
};

/** The rule for the form, or null for an event that happens once. */
export const toRecurrenceRule = (form: RepeatForm): RecurrenceRule | null => {
  const rule = base(form.repeat);
  if (!rule) return null;
  const end =
    form.repeatEnd === "count" && form.repeatCount > 0
      ? { count: Math.round(form.repeatCount) }
      : form.repeatEnd === "until" && form.repeatUntil
        ? { until: `${form.repeatUntil}T23:59:59` }
        : {};
  return { "@type": "RecurrenceRule", ...rule, ...end };
};

const isWeekdays = (rule: RecurrenceRule): boolean =>
  rule.byDay?.length === WEEKDAYS.length &&
  rule.byDay.every((d) => WEEKDAYS.includes(d.day) && !d.nthOfPeriod);

/**
 * The form for a stored rule. Rules made elsewhere (every third month, the last Friday, …) that
 * the form cannot show come back as `null`, so the editor leaves them untouched.
 */
export const fromRecurrenceRule = (rule: RecurrenceRule | null | undefined): RepeatForm | null => {
  if (!rule) return NO_REPEAT;
  const interval = rule.interval ?? 1;
  const plain = !rule.byMonthDay?.length && (!rule.byDay?.length || isWeekdays(rule));
  if (!plain) return null;
  const repeat: Repeat | null =
    rule.frequency === "weekly" && isWeekdays(rule) && interval === 1
      ? "weekdays"
      : rule.byDay?.length
        ? null
        : rule.frequency === "weekly" && interval === 2
          ? "biweekly"
          : interval !== 1
            ? null
            : rule.frequency === "daily" ||
                rule.frequency === "weekly" ||
                rule.frequency === "monthly" ||
                rule.frequency === "yearly"
              ? rule.frequency
              : null;
  if (!repeat) return null;
  return {
    repeat,
    repeatEnd: rule.count ? "count" : rule.until ? "until" : "never",
    repeatCount: rule.count ?? NO_REPEAT.repeatCount,
    repeatUntil: rule.until?.slice(0, 10) ?? "",
  };
};

const LABELS: Record<Exclude<Repeat, "none">, () => string> = {
  daily: m.calendar_repeat_daily,
  weekdays: m.calendar_repeat_weekdays,
  weekly: m.calendar_repeat_weekly,
  biweekly: m.calendar_repeat_biweekly,
  monthly: m.calendar_repeat_monthly,
  yearly: m.calendar_repeat_yearly,
};

export const repeatLabel = (repeat: Repeat): string =>
  repeat === "none" ? m.calendar_repeat_none() : LABELS[repeat]();

const dayFormat = new Intl.DateTimeFormat("de-DE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "Wöchentlich, 4-mal" – a short German description for the event details. */
export const describeRecurrence = (rule: RecurrenceRule | null | undefined): string | null => {
  if (!rule) return null;
  const form = fromRecurrenceRule(rule);
  const what = form && form.repeat !== "none" ? LABELS[form.repeat]() : m.calendar_repeat_other();
  if (rule.count) return m.calendar_repeat_times({ rule: what, count: rule.count });
  if (rule.until)
    return m.calendar_repeat_until_date({
      rule: what,
      date: dayFormat.format(new Date(`${rule.until.slice(0, 10)}T12:00:00Z`)),
    });
  return what;
};
