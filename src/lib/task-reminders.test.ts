import { describe, expect, it } from "vitest";
import { dueInstant, reminderChoices, reminderKey, shiftedReminder } from "./task-reminders";

// Sunday morning in Berlin (winter time, UTC+1).
const now = new Date("2026-10-25T08:00:00Z");

describe("reminder choices", () => {
  it("with a time: then, 15 minutes and an hour before, the evening before", () => {
    const choices = reminderChoices({ dueDate: "2026-10-27", dueTime: "14:00" }, now);
    expect(choices.map((choice) => [choice.key, choice.at.toISOString()])).toEqual([
      ["due", "2026-10-27T13:00:00.000Z"],
      ["15", "2026-10-27T12:45:00.000Z"],
      ["60", "2026-10-27T12:00:00.000Z"],
      ["eve", "2026-10-26T16:00:00.000Z"],
    ]);
  });

  it("with a day only: that morning and the evening before; nothing in the past", () => {
    const choices = reminderChoices({ dueDate: "2026-10-26", dueTime: null }, now);
    expect(choices.map((choice) => choice.key)).toEqual(["morning", "eve"]);
    const today = reminderChoices({ dueDate: "2026-10-25", dueTime: null }, now);
    expect(today).toEqual([]);
    expect(reminderChoices({ dueDate: null, dueTime: null }, now)).toEqual([]);
  });

  it("knows a chosen time again, else calls it custom", () => {
    const choices = reminderChoices({ dueDate: "2026-10-27", dueTime: "14:00" }, now);
    expect(reminderKey("2026-10-27T12:45:00.000Z", choices)).toBe("15");
    expect(reminderKey("2026-10-27T10:10:00.000Z", choices)).toBe("custom");
    expect(reminderKey(null, choices)).toBe("");
  });
});

describe("moving the due day", () => {
  it("keeps the reminder the same distance before", () => {
    const task = {
      dueDate: "2026-10-27",
      dueTime: "14:00",
      remindAt: "2026-10-27T12:45:00.000Z",
    };
    expect(shiftedReminder(task, { dueDate: "2026-10-29", dueTime: "14:00" }, now)).toBe(
      "2026-10-29T12:45:00.000Z",
    );
    expect(shiftedReminder(task, { dueDate: "2026-10-27", dueTime: "16:00" }, now)).toBe(
      "2026-10-27T14:45:00.000Z",
    );
  });

  it("drops a reminder that would lie in the past, leaves one without a due day", () => {
    const task = { dueDate: "2026-10-27", dueTime: null, remindAt: "2026-10-27T07:00:00.000Z" };
    expect(shiftedReminder(task, { dueDate: "2026-10-20", dueTime: null }, now)).toBeNull();
    expect(shiftedReminder(task, { dueDate: null, dueTime: null }, now)).toBeUndefined();
    expect(
      shiftedReminder({ ...task, remindAt: null }, { dueDate: "2026-10-28", dueTime: null }, now),
    ).toBeUndefined();
  });

  it("a day without time is due in the morning", () => {
    expect(dueInstant("2026-10-27", null)?.toISOString()).toBe("2026-10-27T07:00:00.000Z");
  });
});
