import { describe, expect, it } from "vitest";
import type { EmailSummary } from "@/jmap/types";
import { sampleTask } from "../../server/tasks/sample-task";
import {
  column,
  dueGroup,
  dueLabel,
  groupByDue,
  inView,
  mailLink,
  parseQuickAdd,
  plainSubject,
  positionBetween,
  type Task,
  tasksOfMail,
} from "./tasks";

const today = "2026-10-24"; // a Saturday

const task = (patch: Partial<Task> = {}): Task =>
  sampleTask({
    id: "t",
    accountId: "me",
    title: "Aufgabe",
    createdBy: "me",
    createdAt: "2026-10-20T10:00:00Z",
    updatedAt: "2026-10-20T10:00:00Z",
    ...patch,
  });

describe("views", () => {
  it("mine: assigned to me, or in my mailbox with nobody assigned", () => {
    expect(inView(task(), "mine", "me", today)).toBe(true);
    expect(inView(task({ assigneeId: "anna" }), "mine", "me", today)).toBe(false);
    expect(inView(task({ accountId: "info", assigneeId: "me" }), "mine", "me", today)).toBe(true);
    expect(inView(task({ accountId: "info" }), "mine", "me", today)).toBe(false);
  });

  it("today takes overdue too, upcoming the days after, done the finished", () => {
    expect(inView(task({ dueDate: "2026-10-20" }), "today", "me", today)).toBe(true);
    expect(inView(task({ dueDate: "2026-10-25" }), "today", "me", today)).toBe(false);
    expect(inView(task({ dueDate: "2026-10-25" }), "upcoming", "me", today)).toBe(true);
    expect(
      inView(task({ status: "done", completedAt: "2026-10-20T10:00:00Z" }), "mine", "me", today),
    ).toBe(false);
    expect(inView(task({ status: "done" }), "done", "me", today)).toBe(true);
    // Ticked off today: still there, at the end.
    const justNow = task({ status: "done", completedAt: "2026-10-24T09:00:00Z" });
    expect(inView(justNow, "mine", "me", today)).toBe(true);
    expect(inView(justNow, "today", "me", today)).toBe(true);
    expect(inView(justNow, "upcoming", "me", today)).toBe(false);
  });
});

describe("due dates", () => {
  it("groups by overdue, today, this week, later, none", () => {
    expect(dueGroup("2026-10-23", today)).toBe("overdue");
    expect(dueGroup(today, today)).toBe("today");
    expect(dueGroup("2026-10-30", today)).toBe("week");
    expect(dueGroup("2026-10-31", today)).toBe("later");
    expect(dueGroup(null, today)).toBe("none");
  });

  it("orders the list by due date and time, done last and newest first", () => {
    const groups = groupByDue(
      [
        task({ id: "a", dueDate: "2026-10-30" }),
        task({ id: "b", dueDate: today, dueTime: "14:00" }),
        task({ id: "c", dueDate: today, dueTime: "09:00" }),
        task({ id: "d", status: "done", completedAt: "2026-10-22T10:00:00Z" }),
        task({ id: "e", status: "done", completedAt: "2026-10-23T10:00:00Z" }),
      ],
      today,
    );
    expect(groups.map((g) => [g.label, g.tasks.map((t) => t.id)])).toEqual([
      ["Heute", ["c", "b"]],
      ["Diese Woche", ["a"]],
      ["Erledigt", ["e", "d"]],
    ]);
  });

  it("names the day as people say it", () => {
    expect(dueLabel(today, null, today)).toBe("Heute");
    expect(dueLabel("2026-10-25", "14:00", today)).toBe("Morgen, 14:00");
    expect(dueLabel("2026-10-30", null, today)).toBe("Fr., 30. Okt.");
    expect(dueLabel(null, null, today)).toBe("");
  });
});

describe("board", () => {
  it("lists a column in order and finds a place between neighbours", () => {
    const tasks = [
      task({ id: "a", position: 2 }),
      task({ id: "b", position: 1 }),
      task({ id: "c", status: "done" }),
    ];
    expect(column(tasks, "open").map((t) => t.id)).toEqual(["b", "a"]);
    expect(positionBetween(1, 2)).toBe(1.5);
    expect(positionBetween(undefined, 1)).toBe(0);
    expect(positionBetween(3)).toBe(4);
    expect(positionBetween()).toBe(1);
  });
});

describe("parseQuickAdd", () => {
  it("takes a day from the last word", () => {
    expect(parseQuickAdd("Rückruf Hoffmann morgen", today)).toEqual({
      title: "Rückruf Hoffmann",
      dueDate: "2026-10-25",
    });
    expect(parseQuickAdd("Angebot Lang Freitag", today)).toEqual({
      title: "Angebot Lang",
      dueDate: "2026-10-30",
    });
    expect(parseQuickAdd("Bauamt anrufen sa", today).dueDate).toBe("2026-10-31");
    expect(parseQuickAdd("Rechnung 30.10.", today)).toEqual({
      title: "Rechnung",
      dueDate: "2026-10-30",
    });
    expect(parseQuickAdd("Zertifikat 5.1.", today).dueDate).toBe("2027-01-05");
    expect(parseQuickAdd("Heizung prüfen", today)).toEqual({
      title: "Heizung prüfen",
      dueDate: null,
    });
    expect(parseQuickAdd("morgen", today)).toEqual({ title: "morgen", dueDate: null });
  });
});

describe("tasks and mails", () => {
  const mail = {
    id: "m1",
    threadId: "th1",
    subject: "AW: Re: Anfrage Wärmepumpe",
    from: [{ name: "Thomas Lang", email: "lang@x.de" }],
  } as unknown as EmailSummary;

  it("titles without reply prefixes and links the conversation", () => {
    expect(plainSubject(mail.subject ?? "")).toBe("Anfrage Wärmepumpe");
    const link = mailLink("info", mail);
    expect(link).toEqual({
      kind: "mail",
      accountId: "info",
      ref: "m1",
      threadId: "th1",
      label: "AW: Re: Anfrage Wärmepumpe",
      detail: "Thomas Lang",
    });
    const tasks = [task({ links: [link] }), task({ id: "x" })];
    expect(tasksOfMail(tasks, "m2", "th1")).toHaveLength(1);
    expect(tasksOfMail(tasks, "m3", "other")).toHaveLength(0);
  });
});
