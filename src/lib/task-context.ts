/**
 * Tasks outside the tasks app: on a contact, in the calendar, in the bell. Pure; days are
 * "YYYY-MM-DD" in the company's time zone.
 */
import type { Task, TaskLink } from "../../server/tasks/tasks";
import { isMine } from "./tasks";

const open = (task: Task) => task.status !== "done";

/**
 * A contact's tasks: linked to the card, or to a mail with them (by its conversation). Open ones
 * first by due day, then the ones just finished.
 */
export const tasksOfContact = (
  tasks: Task[],
  contact: { accountId: string; id: string },
  threadIds: ReadonlySet<string>,
): Task[] =>
  tasks
    .filter((task) =>
      task.links.some(
        (link) =>
          (link.kind === "contact" &&
            link.ref === contact.id &&
            link.accountId === contact.accountId) ||
          (link.kind === "mail" && link.threadId !== null && threadIds.has(link.threadId)),
      ),
    )
    .sort(
      (a, b) =>
        Number(open(b)) - Number(open(a)) ||
        (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
    );

/** The link from a task to a contact card. */
export const contactLink = (
  contact: { accountId: string; id: string },
  name: string,
  address: string,
): TaskLink => ({
  kind: "contact",
  accountId: contact.accountId,
  ref: contact.id,
  threadId: null,
  label: name,
  detail: address,
});

export type DayTask = { task: Task; day: string; overdue: boolean };

/**
 * My open tasks with a due day, on that day; what is overdue shows on today, so nothing is lost
 * in the past. Those due at a time first, by time.
 */
export const calendarTasks = (tasks: Task[], me: string, today: string): DayTask[] =>
  tasks
    .filter((task) => open(task) && task.dueDate !== null && isMine(task, me))
    .map((task) => {
      const overdue = task.dueDate! < today;
      return { task, day: overdue ? today : task.dueDate!, overdue };
    })
    .sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        Number(b.overdue) - Number(a.overdue) ||
        (a.task.dueTime ?? "99").localeCompare(b.task.dueTime ?? "99"),
    );

export const tasksOnDay = (list: DayTask[], day: string): DayTask[] =>
  list.filter((entry) => entry.day === day);

/**
 * When a task is due on its day, in minutes from midnight; null without a time, and for overdue
 * ones on today, whose time has passed on another day.
 */
export const dueMinutes = (entry: DayTask): number | null => {
  if (entry.overdue || !entry.task.dueTime) return null;
  const [hours, minutes] = entry.task.dueTime.split(":").map(Number);
  return hours! * 60 + minutes!;
};

/** For the bell: my open tasks due today or before. */
export const dueTasks = (tasks: Task[], me: string, today: string): Task[] =>
  calendarTasks(tasks, me, today)
    .filter((entry) => entry.day === today)
    .map((entry) => entry.task);

/** How long a task given to me stays "new" in the bell. */
export const NEW_TASK_DAYS = 7;

/** For the bell: open tasks someone else gave me lately, the newest first. */
export const assignedToMe = (tasks: Task[], me: string, now: Date): Task[] =>
  tasks
    .filter(
      (task) =>
        open(task) &&
        task.assigneeId === me &&
        task.assignedBy !== null &&
        task.assignedBy !== me &&
        task.assignedAt !== null &&
        now.getTime() - new Date(task.assignedAt).getTime() < NEW_TASK_DAYS * 86_400_000,
    )
    .sort((a, b) => (b.assignedAt ?? "").localeCompare(a.assignedAt ?? ""));
