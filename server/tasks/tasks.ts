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

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);

export const checkItemSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().trim().min(1).max(300),
  done: z.boolean(),
});
export type CheckItem = z.infer<typeof checkItemSchema>;

export const taskLinkSchema = z.object({
  /** chat: a message (`ref`) in a channel (`accountId`). */
  kind: z.enum(["mail", "contact", "event", "chat"]),
  accountId: z.string().min(1).max(64),
  ref: z.string().min(1).max(200),
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

/** The instant of a day and time in Berlin, summer or winter time. */
export const berlinInstant = (day: string, time: string): Date => {
  const asUtc = Date.parse(`${day}T${time}:00Z`);
  const offset = (at: number) => {
    const name = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date(at))
      .find((part) => part.type === "timeZoneName")?.value;
    const [, sign, hours] = name?.match(/GMT([+-])(\d+)/) ?? [];
    return sign ? (sign === "-" ? -1 : 1) * Number(hours) * 3_600_000 : 0;
  };
  return new Date(asUtc - offset(asUtc - offset(asUtc)));
};

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
