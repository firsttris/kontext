import { describe, expect, it } from "vitest";
import { sampleTask } from "../../server/tasks/sample-task";
import {
  assignedToMe,
  calendarTasks,
  contactLink,
  dueMinutes,
  dueTasks,
  eventLink,
  linkedMails,
  MAX_LINKED_MAILS,
  mailKey,
  mailsWith,
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
    const keys = new Set([mailKey("me", "m-t1"), mailKey("me", "m-t9")]);
    expect(tasksOfContact(tasks, card, keys).map((task) => task.id)).toEqual(["c", "a", "b"]);
  });

  it("a mail is known by account and id: the same id in info@ is another mail", () => {
    const tasks = [sampleTask({ id: "a", links: [{ ...mail("t1"), accountId: "info" }] })];
    expect(tasksOfContact(tasks, card, new Set([mailKey("me", "m-t1")]))).toEqual([]);
    expect(tasksOfContact(tasks, card, new Set([mailKey("info", "m-t1")]))).toHaveLength(1);
  });
});

describe("mails linked to tasks", () => {
  it("by account, only those one can open, each once", () => {
    const tasks = [
      sampleTask({ id: "a", links: [mail("t1"), { ...mail("t2"), accountId: "info" }] }),
      sampleTask({ id: "b", links: [mail("t1"), { ...mail("t3"), accountId: "gone" }] }),
    ];
    expect(linkedMails(tasks, ["me", "info"])).toEqual({ me: ["m-t1"], info: ["m-t2"] });
  });

  it("at most so many per account, the newest tasks' first", () => {
    const tasks = Array.from({ length: MAX_LINKED_MAILS + 5 }, (_, index) =>
      sampleTask({
        id: String(index),
        updatedAt: new Date(Date.UTC(2026, 0, 1) + index * 60_000).toISOString(),
        links: [mail(`t${index}`)],
      }),
    );
    const ids = linkedMails(tasks, ["me"]).me!;
    expect(ids).toHaveLength(MAX_LINKED_MAILS);
    expect(ids[0]).toBe(`m-t${MAX_LINKED_MAILS + 4}`);
  });

  it("with the person when they sent it or got it, in any case of letters", () => {
    const party = (email: string) => [{ email }];
    const mails = [
      { accountId: "me", id: "1", from: party("Petra@Keller.test"), to: null, cc: null },
      {
        accountId: "info",
        id: "2",
        from: party("x@y.test"),
        to: null,
        cc: party("petra@keller.test"),
      },
      { accountId: "me", id: "3", from: party("x@y.test"), to: party("z@y.test"), cc: null },
    ];
    expect([...mailsWith(mails, ["petra@keller.test"])]).toEqual([
      mailKey("me", "1"),
      mailKey("info", "2"),
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

  it("at their time in the grid, unless overdue or without a time", () => {
    const list = calendarTasks(
      [
        ...tasks,
        sampleTask({ id: "late-timed", assigneeId: "me", dueDate: "2026-10-20", dueTime: "08:00" }),
      ],
      "me",
      today,
    );
    expect(list.map((entry) => [entry.task.id, dueMinutes(entry)])).toEqual([
      ["late-timed", null],
      ["late", null],
      ["today", 540],
      ["soon", null],
    ]);
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

describe("the link to an appointment", () => {
  const event = {
    id: "e1",
    accountId: "me",
    calendarIds: { c: true },
    title: "Abnahme Hoffmann",
    start: "2026-10-29T10:00:00",
    timeZone: "Europe/Berlin",
    duration: "PT1H",
  };

  it("opens the appointment and says when it is", () => {
    expect(eventLink(event, "Ohne Titel")).toEqual({
      kind: "event",
      accountId: "me",
      ref: "e1",
      threadId: "2026-10-29",
      label: "Abnahme Hoffmann",
      detail: "Do., 29. Okt. 2026, 10:00",
    });
  });

  it("a whole day without a time, and a name without a title", () => {
    const link = eventLink(
      { ...event, title: "", start: "2026-10-29T00:00:00", showWithoutTime: true, duration: "P1D" },
      "Ohne Titel",
    );
    expect([link.label, link.detail]).toEqual(["Ohne Titel", "Do., 29. Okt. 2026"]);
  });
});
