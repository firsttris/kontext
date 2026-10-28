/**
 * Tasks as the app shows them: the views (mine, today, upcoming, done), groups by due date, the
 * order on the board, the quick entry ("Rückruf Hoffmann morgen") and a task from a mail. Pure;
 * what a task is: server/tasks/tasks.ts. Days are "YYYY-MM-DD" in the company's time zone.
 */
import type { EmailSummary } from "@/jmap/types";
import { m } from "@/paraglide/messages";
import type {
  BoardColumn,
  NewTask,
  Repeat,
  Task,
  TaskLink,
  TaskStatus,
} from "../../server/tasks/tasks";
import { DEFAULT_COLUMNS, isCalendarDay, REPEATS, TASK_STATUSES } from "../../server/tasks/tasks";
import { displayName } from "./format";
import { addDays, dateKey } from "./jscalendar";
import { LOCALE } from "./locale";

export {
  type BoardColumn,
  DEFAULT_COLUMNS,
  type NewTask,
  REPEATS,
  type Repeat,
  TASK_STATUSES,
  type Task,
  type TaskLink,
  type TaskStatus,
};

export type TaskView = "mine" | "today" | "upcoming" | "done";

const BUILT_IN_LABELS: Record<string, () => string> = {
  open: m.tasks_status_open,
  doing: m.tasks_status_doing,
  waiting: m.tasks_status_waiting,
  done: m.tasks_status_done,
};

/** A column's name: its own, else the app's for a built-in one. */
export const columnLabel = (column: BoardColumn): string =>
  column.name || BUILT_IN_LABELS[column.id]?.() || column.id;

export const REPEAT_LABELS: Record<Repeat, () => string> = {
  daily: m.tasks_repeat_daily,
  weekdays: m.tasks_repeat_weekdays,
  weekly: m.tasks_repeat_weekly,
  monthly: m.tasks_repeat_monthly,
  yearly: m.tasks_repeat_yearly,
};

/** A new column's id: "c-" and letters from its name, made unique. */
export const newColumnId = (name: string, taken: string[]): string => {
  const base = `c-${
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 16) || "spalte"
  }`.padEnd(6, "x");
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}${n}`;
  return id;
};

/** Assigned to me, or in my own mailbox with nobody assigned. */
export const isMine = (task: Task, me: string): boolean =>
  task.assigneeId === me || (task.accountId === me && task.assigneeId === null);

/**
 * Whether a task shows in a view. What was ticked off today stays in "mine" and "today", struck
 * through at the end, so one sees what just happened.
 */
export const inView = (task: Task, view: TaskView, me: string, today: string): boolean => {
  if (!isMine(task, me)) return false;
  if (view === "done") return task.status === "done";
  if (task.status === "done") {
    return (
      view !== "upcoming" &&
      task.completedAt !== null &&
      dateKey(new Date(task.completedAt)) === today
    );
  }
  if (view === "today") return task.dueDate !== null && task.dueDate <= today;
  if (view === "upcoming") return task.dueDate !== null && task.dueDate > today;
  return true;
};

export type DueGroup = "overdue" | "today" | "week" | "later" | "none";

export const dueGroup = (dueDate: string | null, today: string): DueGroup => {
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  return dueDate <= addDays(today, 6) ? "week" : "later";
};

const GROUP_LABELS: Record<DueGroup, () => string> = {
  overdue: m.tasks_group_overdue,
  today: m.tasks_group_today,
  week: m.tasks_group_week,
  later: m.tasks_group_later,
  none: m.tasks_group_none,
};

const byDue = (a: Task, b: Task) =>
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
  (a.dueTime ?? "99").localeCompare(b.dueTime ?? "99") ||
  a.position - b.position;

/** The list's sections, in this order, empty ones left out; done ones newest first. */
export const groupByDue = (
  tasks: Task[],
  today: string,
): { group: DueGroup | "done"; label: string; tasks: Task[] }[] => {
  const done = tasks
    .filter((task) => task.status === "done")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));
  const open = tasks.filter((task) => task.status !== "done").sort(byDue);
  const groups = (Object.keys(GROUP_LABELS) as DueGroup[]).map((group) => ({
    group,
    label: GROUP_LABELS[group](),
    tasks: open.filter((task) => dueGroup(task.dueDate, today) === group),
  }));
  return [...groups, { group: "done" as const, label: m.tasks_status_done(), tasks: done }].filter(
    (entry) => entry.tasks.length,
  );
};

const dayFormat = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "Heute", "Morgen, 14:00", "Fr., 30. Okt.". */
export const dueLabel = (dueDate: string | null, dueTime: string | null, today: string): string => {
  if (!dueDate) return "";
  const day =
    dueDate === today
      ? m.tasks_due_today()
      : dueDate === addDays(today, 1)
        ? m.tasks_due_tomorrow()
        : dueDate === addDays(today, -1)
          ? m.tasks_due_yesterday()
          : dayFormat.format(new Date(`${dueDate}T12:00:00Z`));
  return dueTime ? `${day}, ${dueTime}` : day;
};

/** One board column: the tasks of a status, in their order. */
export const column = (tasks: Task[], status: TaskStatus): Task[] =>
  tasks.filter((task) => task.status === status).sort((a, b) => a.position - b.position);

/** A position between two neighbours (either may be missing), for dropping in between. */
export const positionBetween = (before?: number, after?: number): number => {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
};

const WEEKDAYS = ["sonntag", "montag", "dienstag", "mittwoch", "donnerstag", "freitag", "samstag"];
const SHORT_DAYS = ["so", "mo", "di", "mi", "do", "fr", "sa"];

const weekdayOf = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/**
 * "Rückruf Hoffmann morgen" → the title and the day: a last word "heute", "morgen",
 * "übermorgen", a weekday (the next one) or a date "30.10." / "30.10.2026".
 */
export const parseQuickAdd = (
  text: string,
  today: string,
): { title: string; dueDate: string | null } => {
  const trimmed = text.trim();
  const match = trimmed.match(/^(.*\S)\s+(\S+)$/);
  if (!match) return { title: trimmed, dueDate: null };
  const [, rest, word] = match as unknown as [string, string, string];
  const key = word.toLowerCase().replace(/[.,]$/, "");
  const relative: Record<string, number> = { heute: 0, morgen: 1, übermorgen: 2 };
  if (key in relative) return { title: rest, dueDate: addDays(today, relative[key]!) };
  const weekday = WEEKDAYS.indexOf(key) >= 0 ? WEEKDAYS.indexOf(key) : SHORT_DAYS.indexOf(key);
  if (weekday >= 0) {
    const ahead = (weekday - weekdayOf(today) + 7) % 7 || 7;
    return { title: rest, dueDate: addDays(today, ahead) };
  }
  const date = word.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})?$/);
  if (date) {
    const [, d, mo, y] = date as unknown as [string, string, string, string | undefined];
    let day = `${y ?? today.slice(0, 4)}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    // "5.1." in December means next January.
    if (!y && day < today) day = `${Number(today.slice(0, 4)) + 1}${day.slice(4)}`;
    // "31.4." or "5.13." is no day: it stays part of the title, like any other last word.
    if (isCalendarDay(day)) return { title: rest, dueDate: day };
  }
  return { title: trimmed, dueDate: null };
};

/** "AW: Re: Angebot" → "Angebot", for a task's title. */
export const plainSubject = (subject: string): string =>
  subject.replace(/^(\s*(re|aw|wg|fwd?|antw)\s*:\s*)+/i, "").trim();

/** The link from a task to a mail (its whole conversation). */
export const mailLink = (accountId: string, email: EmailSummary): TaskLink => ({
  kind: "mail",
  accountId,
  ref: email.id,
  threadId: email.threadId ?? null,
  label: email.subject || m.mail_no_subject(),
  detail: displayName(email.from?.[0]),
});

/** The tasks about a mail, through any mail of its conversation. */
export const tasksOfMail = (tasks: Task[], emailId: string, threadId: string | null): Task[] =>
  tasks.filter((task) =>
    task.links.some(
      (link) =>
        link.kind === "mail" && (link.ref === emailId || (threadId && link.threadId === threadId)),
    ),
  );
