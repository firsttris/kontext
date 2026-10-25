/**
 * Pushes about tasks: to whom a task was just given, and reminders when they are due – sent every
 * minute by the server, so they also reach a phone with Kontext closed.
 */
import type { Notice } from "../push/pusher";
import type { TaskStore } from "./store";
import type { Task } from "./tasks";

const dayFormat = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** "Fällig Fr., 30. Okt., 14:00", or nothing without a day. */
export const dueText = (task: Pick<Task, "dueDate" | "dueTime">): string => {
  if (!task.dueDate) return "";
  const day = dayFormat.format(new Date(`${task.dueDate}T12:00:00Z`));
  return `Fällig ${day}${task.dueTime ? `, ${task.dueTime}` : ""}`;
};

const taskUrl = (task: Task) => `/tasks?task=${encodeURIComponent(task.id)}`;

/** Who hears of a task: its assignee, else who made it. */
export const recipientOf = (task: Pick<Task, "assigneeId" | "createdBy">): string =>
  task.assigneeId ?? task.createdBy;

export const assignedNotice = (task: Task, by: string): Notice => ({
  title: by ? `${by} hat dir eine Aufgabe gegeben` : "Neue Aufgabe für dich",
  body: [task.title, dueText(task)].filter(Boolean).join(" · "),
  url: taskUrl(task),
  tag: `task-${task.id}`,
});

export const reminderNotice = (task: Task): Notice => ({
  title: `Erinnerung: ${task.title}`,
  body: dueText(task) || task.notes.slice(0, 120),
  url: taskUrl(task),
  tag: `task-${task.id}`,
});

export const createTaskReminder = ({
  store,
  notify,
  now = () => new Date(),
}: {
  store: Pick<TaskStore, "dueReminders" | "markReminded">;
  notify: (memberIds: string[], notice: Notice) => Promise<void>;
  now?: () => Date;
}) => {
  let running = false;
  return {
    /** Every reminder due; a tick still at work skips the next. */
    tick: async () => {
      if (running) return;
      running = true;
      try {
        const at = now();
        for (const task of await store.dueReminders(at)) {
          // Marked first: a push service that hangs must not send it twice.
          await store.markReminded(task.id, at);
          await notify([recipientOf(task)], reminderNotice(task)).catch(() => undefined);
        }
      } finally {
        running = false;
      }
    },
  };
};
