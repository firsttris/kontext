// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sampleTask } from "../tasks/sample-task";
import { parseLines, readRepeat, readVtodo, toVtodo } from "./ical";

const todo = (lines: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VTODO", ...lines, "END:VTODO", "END:VCALENDAR"].join(
    "\r\n",
  );

describe("tasks as VTODO", () => {
  it("writes title, notes, due time in UTC, repeat and reminder", () => {
    const text = toVtodo(
      sampleTask({
        title: "Angebot; Bad, OG",
        notes: "Zeile 1\nZeile 2",
        status: "doing",
        dueDate: "2026-10-27",
        dueTime: "14:00",
        repeat: "weekdays",
        remindAt: "2026-10-27T12:45:00.000Z",
      }),
      "t1",
    );
    expect(text).toContain("SUMMARY:Angebot\\; Bad\\, OG\r\n");
    expect(text).toContain("DESCRIPTION:Zeile 1\\nZeile 2\r\n");
    expect(text).toContain("STATUS:IN-PROCESS\r\n");
    expect(text).toContain("DUE:20261027T130000Z\r\n");
    expect(text).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR\r\n");
    expect(text).toContain("TRIGGER;VALUE=DATE-TIME:20261027T124500Z\r\n");
    expect(text.split("\r\n").every((line) => new TextEncoder().encode(line).length <= 75)).toBe(
      true,
    );
  });

  it("a day without time, and done", () => {
    const text = toVtodo(
      sampleTask({ status: "done", dueDate: "2026-10-27", completedAt: "2026-10-26T09:00:00Z" }),
      "t1",
    );
    expect(text).toContain("DUE;VALUE=DATE:20261027\r\n");
    expect(text).toContain("STATUS:COMPLETED\r\n");
    expect(text).toContain("COMPLETED:20261026T090000Z\r\n");
  });

  it("long lines fold and unfold to the same", () => {
    const title = "Ä".repeat(100);
    const parsed = readVtodo(toVtodo(sampleTask({ title }), "t1"));
    expect(parsed?.title).toBe(title);
  });

  it("reads what a client wrote: zone, alarm before the due time, repeat", () => {
    const parsed = readVtodo(
      todo([
        "UID:abc@tasks.org",
        "SUMMARY:Zählerstand",
        "DUE;TZID=Europe/Berlin:20261102T090000",
        "RRULE:FREQ=MONTHLY",
        "STATUS:NEEDS-ACTION",
        "BEGIN:VALARM",
        "TRIGGER:-PT15M",
        "ACTION:DISPLAY",
        "END:VALARM",
      ]),
    );
    expect(parsed).toEqual({
      uid: "abc@tasks.org",
      title: "Zählerstand",
      notes: "",
      state: "open",
      dueDate: "2026-11-02",
      dueTime: "09:00",
      remindAt: "2026-11-02T07:45:00.000Z",
      repeat: "monthly",
    });
  });

  it("a due time in UTC becomes Berlin time; completed is done", () => {
    const parsed = readVtodo(
      todo(["UID:x", "SUMMARY:A", "DUE:20260710T080000Z", "COMPLETED:20260710T090000Z"]),
    );
    expect(parsed).toMatchObject({ dueDate: "2026-07-10", dueTime: "10:00", state: "done" });
  });

  it("knows the repeats Kontext has, not finer ones", () => {
    expect(readRepeat("FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR")).toBe("weekdays");
    expect(readRepeat("FREQ=YEARLY")).toBe("yearly");
    expect(readRepeat("FREQ=WEEKLY;INTERVAL=2")).toBeNull();
    expect(readRepeat("FREQ=MONTHLY;BYMONTHDAY=15")).toBeNull();
  });

  it("reads quoted parameters with colons", () => {
    expect(parseLines('ATTENDEE;CN="Weber: Jonas":mailto:j@w.test')[0]).toEqual({
      name: "ATTENDEE",
      params: { CN: "Weber: Jonas" },
      value: "mailto:j@w.test",
    });
  });
});
