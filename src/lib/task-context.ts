/**
 * Tasks outside the tasks app: on a contact, in the calendar, in the bell. Pure; days are
 * "YYYY-MM-DD" in the company's time zone.
 */
import type { Task, TaskLink } from "../../server/tasks/tasks";
import { type CalendarEvent, dateKey, eventTimes } from "./jscalendar";
import { LOCALE } from "./locale";
import { isMine } from "./tasks";

const open = (task: Task) => task.status !== "done";

/** A mail as one account knows it: "account/id". */
export const mailKey = (accountId: string, emailId: string): string => `${accountId}/${emailId}`;

/** How many linked mails are looked at per account, the newest tasks' first. */
export const MAX_LINKED_MAILS = 500;

/**
 * The mails the tasks link to, by account, to look up who they were with – only in the accounts
 * one can open (the own and the shared mailboxes), at most `MAX_LINKED_MAILS` each.
 */
export const linkedMails = (tasks: Task[], accountIds: string[]): Record<string, string[]> => {
  const links = [...tasks]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .flatMap((task) => task.links)
    .filter((link) => link.kind === "mail");
  return Object.fromEntries(
    accountIds.flatMap((accountId) => {
      const ids = [
        ...new Set(links.filter((link) => link.accountId === accountId).map((link) => link.ref)),
      ].slice(0, MAX_LINKED_MAILS);
      return ids.length ? [[accountId, ids]] : [];
    }),
  );
};

type Party = { email: string };

/** The mails, by `mailKey`, that one of these addresses sent or got (From, To, Cc). */
export const mailsWith = (
  mails: {
    accountId: string;
    id: string;
    from: Party[] | null;
    to: Party[] | null;
    cc: Party[] | null;
  }[],
  addresses: string[],
): Set<string> => {
  const wanted = new Set(addresses.map((address) => address.toLowerCase()));
  return new Set(
    mails
      .filter((mail) =>
        [...(mail.from ?? []), ...(mail.to ?? []), ...(mail.cc ?? [])].some((party) =>
          wanted.has(party.email.toLowerCase()),
        ),
      )
      .map((mail) => mailKey(mail.accountId, mail.id)),
  );
};

/**
 * A contact's tasks: linked to the card, or to a mail with them (`mailKeys`, see `mailsWith`),
 * whichever mailbox it lies in. Open ones first by due day, then the ones just finished.
 */
export const tasksOfContact = (
  tasks: Task[],
  contact: { accountId: string; id: string },
  mailKeys: ReadonlySet<string>,
): Task[] =>
  tasks
    .filter((task) =>
      task.links.some(
        (link) =>
          (link.kind === "contact" &&
            link.ref === contact.id &&
            link.accountId === contact.accountId) ||
          (link.kind === "mail" && mailKeys.has(mailKey(link.accountId, link.ref))),
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

const eventDay = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "Europe/Berlin",
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const eventTime = new Intl.DateTimeFormat(LOCALE, {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The link from a task to an appointment ("Aufgabe zum Termin"): it opens the appointment on its
 * day (kept in `threadId`, as the calendar only finds what it shows), the detail says when it is.
 * A series' single date is linked as that date.
 */
export const eventLink = (
  event: CalendarEvent & { accountId: string },
  untitled: string,
): TaskLink => {
  const { start, allDay } = eventTimes(event);
  return {
    kind: "event",
    accountId: event.accountId,
    ref: event.id,
    threadId: dateKey(start),
    label: event.title || untitled,
    detail: allDay
      ? eventDay.format(start)
      : `${eventDay.format(start)}, ${eventTime.format(start)}`,
  };
};

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
