// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Notice } from "../push/pusher";
import { assignedNotice, createTaskReminder, dueText, recipientOf } from "./notices";
import { sampleTask } from "./sample-task";
import { berlinInstant, nextDue, nextOccurrence } from "./tasks";

describe("task notices", () => {
  it("names the day and time it is due", () => {
    expect(dueText({ dueDate: "2026-10-30", dueTime: "14:00" })).toBe(
      "Fällig Fr., 30. Okt., 14:00",
    );
    expect(dueText({ dueDate: "2026-10-30", dueTime: null })).toBe("Fällig Fr., 30. Okt.");
    expect(dueText({ dueDate: null, dueTime: null })).toBe("");
  });

  it("goes to the assignee, else to who made it", () => {
    expect(recipientOf(sampleTask({ assigneeId: "lea" }))).toBe("lea");
    expect(recipientOf(sampleTask())).toBe("jonas");
  });

  it("says who gave the task and opens it", () => {
    const notice = assignedNotice(sampleTask({ dueDate: "2026-10-30", dueTime: null }), "Jonas");
    expect(notice).toEqual({
      title: "Jonas hat dir eine Aufgabe gegeben",
      body: "Rückruf Hoffmann · Fällig Fr., 30. Okt.",
      url: "/tasks?task=t1",
      tag: "task-t1",
    });
  });

  it("reminds once and marks the reminder sent", async () => {
    const due = [sampleTask({ assigneeId: "lea", remindAt: "2026-10-25T09:00:00.000Z" })];
    const marked: string[] = [];
    const sent: [string[], Notice][] = [];
    const reminder = createTaskReminder({
      store: {
        dueReminders: async () => due.filter((task) => !marked.includes(task.id)),
        markReminded: async (id) => {
          marked.push(id);
        },
      },
      notify: async (ids, notice) => {
        sent.push([ids, notice]);
      },
      now: () => new Date("2026-10-25T09:00:30Z"),
    });
    await reminder.tick();
    await reminder.tick();
    expect(marked).toEqual(["t1"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]![0]).toEqual(["lea"]);
    expect(sent[0]![1].title).toBe("Erinnerung: Rückruf Hoffmann");
  });
});

describe("repeating tasks", () => {
  it("steps by day, workday, week, month (to its last day) and year, past today", () => {
    expect(nextDue("2026-10-25", "daily", "2026-10-25")).toBe("2026-10-26");
    expect(nextDue("2026-10-20", "daily", "2026-10-25")).toBe("2026-10-26");
    expect(nextDue("2026-10-23", "weekdays", "2026-10-23")).toBe("2026-10-26");
    expect(nextDue("2026-10-30", "weekly", "2026-10-27")).toBe("2026-11-06");
    expect(nextDue("2027-01-31", "monthly", "2027-01-31")).toBe("2027-02-28");
    expect(nextDue("2026-10-25", "yearly", "2026-10-25")).toBe("2027-10-25");
    expect(nextDue(null, "weekly", "2026-10-25")).toBe("2026-11-01");
  });

  it("the next one: open, steps unticked, reminder moved along", () => {
    const next = nextOccurrence(
      sampleTask({
        status: "done",
        dueDate: "2026-10-26",
        dueTime: "09:00",
        remindAt: "2026-10-26T07:45:00.000Z",
        repeat: "weekly",
        checklist: [{ id: "a", text: "Ablesen", done: true }],
      }),
      "2026-10-26",
    );
    expect(next).toMatchObject({
      status: "open",
      dueDate: "2026-11-02",
      remindAt: "2026-11-02T07:45:00.000Z",
      checklist: [{ id: "a", text: "Ablesen", done: false }],
      repeat: "weekly",
    });
  });

  it("keeps the reminder's local time across the change to winter time", () => {
    expect(berlinInstant("2026-10-24", "08:45").toISOString()).toBe("2026-10-24T06:45:00.000Z");
    expect(berlinInstant("2026-10-26", "08:45").toISOString()).toBe("2026-10-26T07:45:00.000Z");
    const next = nextOccurrence(
      sampleTask({
        dueDate: "2026-10-24",
        dueTime: "09:00",
        remindAt: "2026-10-24T06:45:00.000Z",
        repeat: "daily",
      }),
      "2026-10-24",
    );
    expect(next?.remindAt).toBe("2026-10-25T07:45:00.000Z");
  });
});
