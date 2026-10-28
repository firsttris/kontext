/**
 * When a task reminds by push: choices from its due day and time, and keeping the reminder the
 * same distance before when the due day moves. Pure; times in the company's time zone.
 */
import { m } from "@/paraglide/messages";
import type { Task } from "../../server/tasks/tasks";
import { addDays, fromLocal } from "./jscalendar";
import { LOCALE } from "./locale";

export type ReminderChoice = { key: string; label: string; at: Date };

/** The instant a task is due: its time, or the morning of its day. */
export const dueInstant = (dueDate: string | null, dueTime: string | null): Date | null =>
  dueDate ? fromLocal(`${dueDate}T${dueTime ?? "08:00"}:00`) : null;

const on = (day: string, time: string) => fromLocal(`${day}T${time}:00`);

/**
 * With a time: then, 15 minutes and an hour before, the evening before. With a day only: that
 * morning and the evening before. What lies in the past is left out.
 */
export const reminderChoices = (
  task: Pick<Task, "dueDate" | "dueTime">,
  now: Date,
): ReminderChoice[] => {
  const { dueDate, dueTime } = task;
  if (!dueDate) return [];
  const due = dueInstant(dueDate, dueTime)!;
  const before = (minutes: number) => new Date(due.getTime() - minutes * 60_000);
  const eve = { key: "eve", label: m.tasks_remind_eve(), at: on(addDays(dueDate, -1), "17:00") };
  const choices: ReminderChoice[] = dueTime
    ? [
        { key: "due", label: m.tasks_remind_due(), at: due },
        { key: "15", label: m.tasks_remind_minutes({ minutes: 15 }), at: before(15) },
        { key: "60", label: m.tasks_remind_hour(), at: before(60) },
        eve,
      ]
    : [{ key: "morning", label: m.tasks_remind_morning(), at: on(dueDate, "08:00") }, eve];
  return choices.filter((choice) => choice.at.getTime() > now.getTime());
};

/** Which choice a reminder is, or "custom" for a time picked by hand. */
export const reminderKey = (remindAt: string | null, choices: ReminderChoice[]): string => {
  if (!remindAt) return "";
  const at = new Date(remindAt).getTime();
  return choices.find((choice) => choice.at.getTime() === at)?.key ?? "custom";
};

/**
 * The reminder after the due day or time changed: the same distance before, if it is then still
 * ahead; without a due day it stays where it was. `undefined`: nothing to change.
 */
export const shiftedReminder = (
  task: Pick<Task, "dueDate" | "dueTime" | "remindAt">,
  next: { dueDate: string | null; dueTime: string | null },
  now: Date,
): string | null | undefined => {
  const from = dueInstant(task.dueDate, task.dueTime);
  const to = dueInstant(next.dueDate, next.dueTime);
  if (!task.remindAt || !from || !to) return undefined;
  const at = new Date(new Date(task.remindAt).getTime() + (to.getTime() - from.getTime()));
  return at.getTime() > now.getTime() ? at.toISOString() : null;
};

/** "Mo., 26. Okt., 08:00". */
export const reminderLabel = (remindAt: string): string =>
  new Date(remindAt).toLocaleString(LOCALE, {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
