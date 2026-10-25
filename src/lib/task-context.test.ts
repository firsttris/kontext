import { describe, expect, it } from "vitest";
import { sampleTask } from "../../server/tasks/sample-task";
import {
  assignedToMe,
  calendarTasks,
  contactLink,
  dueTasks,
  tasksOfContact,
  tasksOnDay,
} from "./task-context";

const today = "2026-10-25";
const mail = (threadId: string) => ({
  kind: "mail" as const,
  accountId: "me",
  ref: `m-${threadId}`,
  threadId,
  label: "Angebot",
  detail: "Petra Keller",
});

describe("tasks of a contact", () => {
  const card = { accountId: "me", id: "c1" };
  it("linked to the card or to a mail with them, open ones first", () => {
    const tasks = [
      sampleTask({ id: "a", links: [contactLink(card, "Petra Keller", "petra@keller.test")] }),
      sampleTask({ id: "b", links: [mail("t9")], status: "done" }),
      sampleTask({ id: "c", links: [mail("t1")], dueDate: "2026-10-26" }),
      sampleTask({ id: "d", links: [mail("t2")] }),
      sampleTask({ id: "e", links: [contactLink({ accountId: "lea", id: "c1" }, "x", "y")] }),
    ];
    expect(tasksOfContact(tasks, card, new Set(["t1", "t9"])).map((task) => task.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});

describe("tasks in the calendar", () => {
  const tasks = [
    sampleTask({ id: "late", assigneeId: "me", dueDate: "2026-10-20" }),
    sampleTask({ id: "today", assigneeId: "me", dueDate: today, dueTime: "09:00" }),
    sampleTask({ id: "soon", assigneeId: "me", dueDate: "2026-10-27" }),
    sampleTask({ id: "done", assigneeId: "me", dueDate: today, status: "done" }),
    sampleTask({ id: "lea", assigneeId: "lea", dueDate: today }),
    sampleTask({ id: "undated", assigneeId: "me" }),
  ];

  it("mine on their day, overdue ones on today first", () => {
    const list = calendarTasks(tasks, "me", today);
    expect(list.map((entry) => [entry.task.id, entry.day, entry.overdue])).toEqual([
      ["late", today, true],
      ["today", today, false],
      ["soon", "2026-10-27", false],
    ]);
    expect(tasksOnDay(list, "2026-10-27").map((entry) => entry.task.id)).toEqual(["soon"]);
  });

  it("the bell has what is due today or before", () => {
    expect(dueTasks(tasks, "me", today).map((task) => task.id)).toEqual(["late", "today"]);
  });
});

describe("given to me", () => {
  const now = new Date("2026-10-25T10:00:00Z");
  it("open tasks someone else gave me this week, the newest first", () => {
    const tasks = [
      sampleTask({
        id: "a",
        assigneeId: "me",
        assignedBy: "lea",
        assignedAt: "2026-10-24T08:00:00Z",
      }),
      sampleTask({
        id: "b",
        assigneeId: "me",
        assignedBy: "lea",
        assignedAt: "2026-10-25T08:00:00Z",
      }),
      sampleTask({
        id: "own",
        assigneeId: "me",
        assignedBy: "me",
        assignedAt: "2026-10-25T08:00:00Z",
      }),
      sampleTask({
        id: "old",
        assigneeId: "me",
        assignedBy: "lea",
        assignedAt: "2026-10-10T08:00:00Z",
      }),
      sampleTask({
        id: "done",
        assigneeId: "me",
        assignedBy: "lea",
        assignedAt: "2026-10-25T08:00:00Z",
        status: "done",
      }),
      sampleTask({
        id: "lea",
        assigneeId: "lea",
        assignedBy: "me",
        assignedAt: "2026-10-25T08:00:00Z",
      }),
    ];
    expect(assignedToMe(tasks, "me", now).map((task) => task.id)).toEqual(["b", "a"]);
  });
});
