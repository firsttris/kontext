// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Notice } from "../push/pusher";
import { assignedNotice, createTaskReminder, dueText, recipientOf } from "./notices";
import { sampleTask } from "./sample-task";

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
