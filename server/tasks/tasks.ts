/**
 * Tasks: what they are, as the app and the server exchange them. A task belongs to one account
 * (own mailbox or a shared one like info@); its status is its column on the board. A board has
 * the columns Offen … Erledigt, renamed, removed or added in between as the team likes; "open"
 * and "done" stay, first and last, and only "done" counts as finished. Pure.
 */
import { z } from "zod";

/** The columns every board starts with; their names come from the app unless renamed. */
export const TASK_STATUSES = ["open", "doing", "waiting", "done"] as const;
/** A column's id: one of the four, or "c-…" for one a team added. */
export type TaskStatus = string;
const statusId = z.string().regex(/^(open|doing|waiting|done|c-[a-z0-9]{4,24})$/);

/** A board column; an empty name means the app's own name for a built-in one. */
export type BoardColumn = { id: string; name: string };
export const DEFAULT_COLUMNS: BoardColumn[] = TASK_STATUSES.map((id) => ({ id, name: "" }));

export const columnsSchema = z
  .array(z.object({ id: statusId, name: z.string().trim().max(40) }))
  .min(2)
  .max(10)
  .refine(
    (columns) =>
      columns[0]?.id === "open" &&
      columns.at(-1)?.id === "done" &&
      new Set(columns.map((column) => column.id)).size === columns.length &&
      // An added column needs a name; the built-in ones have theirs.
      columns.every((column) => column.name || !column.id.startsWith("c-")),
  );

/** How a task comes again once it is done. */
export const REPEATS = ["daily", "weekdays", "weekly", "monthly", "yearly"] as const;
export type Repeat = (typeof REPEATS)[number];

/**
 * Whether "YYYY-MM-DD" names a day that exists: a Date rolls 31 April over to 1 May, so a day
 * is real only if it comes back unchanged (29 February only in leap years). setUTCFullYear, not
 * Date.UTC, which reads the years 0–99 as 1900–1999.
 */
export const isCalendarDay = (value: string): boolean => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [y, m, d] = match.slice(1).map(Number) as [number, number, number];
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

const day = z.string().refine(isCalendarDay);
/** A time of day, "HH:mm" from 00:00 to 23:59; the calendar places a task at it. */
export const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = z.string().regex(CLOCK_TIME);

export const checkItemSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(300),
  done: z.boolean(),
});
export type CheckItem = z.infer<typeof checkItemSchema>;

export const taskLinkSchema = z.object({
  /**
   * chat: a message (`ref`) in a channel (`accountId`); call: a phone call (`ref`); document: a
   * file in Dokumente (`ref`).
   */
  kind: z.enum(["mail", "contact", "event", "chat", "call", "document"]),
  accountId: z.string().min(1).max(64),
  ref: z.string().min(1).max(200),
  /** mail: its conversation; event: its day (YYYY-MM-DD), so the calendar opens on it. */
  threadId: z.string().max(200).nullable().default(null),
  label: z.string().max(300),
  detail: z.string().max(300).default(""),
});
export type TaskLink = z.infer<typeof taskLinkSchema>;

const fields = {
  title: z.string().trim().min(1).max(300),
  notes: z.string().max(10_000),
  status: statusId,
  position: z.number().finite(),
  assigneeId: z.string().min(1).max(64).nullable(),
  dueDate: day.nullable(),
  dueTime: time.nullable(),
  checklist: z.array(checkItemSchema).max(50),
  links: z.array(taskLinkSchema).max(10),
  repeat: z.enum(REPEATS).nullable(),
  /** When the assignee (else who made it) gets a push; an instant. */
  remindAt: z.iso.datetime().nullable(),
};

export const newTaskSchema = z.object({
  accountId: z.string().min(1).max(64),
  title: fields.title,
  notes: fields.notes.default(""),
  status: fields.status.default("open"),
  position: fields.position.optional(),
  assigneeId: fields.assigneeId.default(null),
  dueDate: fields.dueDate.default(null),
  dueTime: fields.dueTime.default(null),
  checklist: fields.checklist.default([]),
  links: fields.links.default([]),
  remindAt: fields.remindAt.default(null),
  repeat: fields.repeat.default(null),
});
/** As the app sends it (defaults may be left out) and as the server has it after checking. */
export type NewTask = z.input<typeof newTaskSchema>;
export type NewTaskData = z.infer<typeof newTaskSchema>;

/** A change; `accountId` moves the task to another board. */
export const taskPatchSchema = z
  .object({ accountId: z.string().min(1).max(64), ...fields })
  .partial();
export type TaskPatch = z.infer<typeof taskPatchSchema>;

export type Task = {
  id: string;
  accountId: string;
  title: string;
  notes: string;
  status: TaskStatus;
  position: number;
  assigneeId: string | null;
  dueDate: string | null;
  dueTime: string | null;
  checklist: CheckItem[];
  links: TaskLink[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Who assigned it (a personal account id) and when; null without assignee. */
  assignedBy: string | null;
  assignedAt: string | null;
  remindAt: string | null;
  repeat: Repeat | null;
};

/** Today in the company's time zone, as "YYYY-MM-DD". */
export const companyDay = (now: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(now);

/** The offset of a zone from UTC at an instant, in milliseconds. */
const zoneOffset = (timeZone: string, at: number): number => {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(new Date(at))
    .find((part) => part.type === "timeZoneName")?.value;
  // "GMT+1", "GMT-4", "GMT+5:30"; plain "GMT" is no offset.
  const [, sign, hours, minutes] = name?.match(/GMT([+-])(\d+)(?::(\d+))?/) ?? [];
  if (!sign) return 0;
  return (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes ?? 0)) * 60_000;
};

/**
 * The instant of a day and time in an IANA time zone, summer or winter time. Around a switch
 * the wall time is read with the offset of the day before or of the day after, whichever gives
 * it back; a time that comes twice (fall back) is the first, and one that does not exist
 * (spring forward) takes the offset before the switch, so 02:30 is 03:30 summer time
 * (RFC 5545 §3.3.5).
 */
export const zonedInstant = (day: string, time: string, timeZone: string): Date => {
  const wall = Date.parse(`${day}T${time}:00Z`);
  const [before, after] = [wall - 86_400_000, wall + 86_400_000].map(
    (at) => wall - zoneOffset(timeZone, at),
  ) as [number, number];
  const exact = [before, after].filter((at) => at + zoneOffset(timeZone, at) === wall);
  return new Date(exact.length ? Math.min(...exact) : before);
};

/** The instant of a day and time in Berlin, summer or winter time. */
export const berlinInstant = (day: string, time: string): Date =>
  zonedInstant(day, time, "Europe/Berlin");

const DAY = 86_400_000;
const toDay = (date: Date) => date.toISOString().slice(0, 10);
const plusDays = (day: string, days: number) =>
  toDay(new Date(Date.parse(`${day}T12:00:00Z`) + days * DAY));

/** The same day of the month later on, or the month's last day (31 Jan → 28 Feb). */
const plusMonths = (day: string, months: number) => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return toDay(first);
};

const step = (day: string, repeat: Repeat): string => {
  if (repeat === "daily") return plusDays(day, 1);
  if (repeat === "weekly") return plusDays(day, 7);
  if (repeat === "monthly") return plusMonths(day, 1);
  if (repeat === "yearly") return plusMonths(day, 12);
  // Weekdays: the next Monday to Friday.
  let next = plusDays(day, 1);
  while ([0, 6].includes(new Date(`${next}T12:00:00Z`).getUTCDay())) next = plusDays(next, 1);
  return next;
};

/**
 * The next due day of a repeating task, done `today`: one step after its due day (or today, if it
 * had none), and on until it lies after today – an overdue daily task comes tomorrow, not
 * yesterday.
 */
export const nextDue = (dueDate: string | null, repeat: Repeat, today: string): string => {
  let next = step(dueDate ?? today, repeat);
  while (next <= today) next = step(next, repeat);
  return next;
};

/** The task that follows a repeating one: the same, open, due on its next day. */
export const nextOccurrence = (task: Task, today: string): NewTaskData | null => {
  if (!task.repeat) return null;
  const dueDate = nextDue(task.dueDate, task.repeat, today);
  // The reminder keeps its distance to the due time, in local time (also across summer time).
  const time = task.dueTime ?? "08:00";
  const before = task.dueDate
    ? berlinInstant(task.dueDate, time).getTime() - Date.parse(task.remindAt ?? "")
    : Number.NaN;
  return {
    accountId: task.accountId,
    title: task.title,
    notes: task.notes,
    status: "open",
    assigneeId: task.assigneeId,
    dueDate,
    dueTime: task.dueTime,
    checklist: task.checklist.map((item) => ({ ...item, done: false })),
    links: task.links,
    remindAt: Number.isFinite(before)
      ? new Date(berlinInstant(dueDate, time).getTime() - before).toISOString()
      : null,
    repeat: task.repeat,
  };
};
