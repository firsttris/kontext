// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sampleTask } from "../tasks/sample-task";
import { parseLines, readDate, readRepeat, readVtodo, toVtodo } from "./ical";

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

  it("a due time in another zone becomes Berlin time (RFC 5545 §3.3.5, form 3)", () => {
    const due = (line: string) => readVtodo(todo(["UID:x", "SUMMARY:A", line]));
    // New York on daylight time (UTC-4), Berlin already back on winter time (UTC+1).
    expect(due("DUE;TZID=America/New_York:20261030T080000")).toMatchObject({
      dueDate: "2026-10-30",
      dueTime: "13:00",
    });
    // Both on winter time: UTC-5 and UTC+1.
    expect(due("DUE;TZID=America/New_York:20261102T090000")).toMatchObject({
      dueDate: "2026-11-02",
      dueTime: "15:00",
    });
    // Half-hour offsets: 09:00 in Kolkata (UTC+5:30) is 04:30 in Berlin.
    expect(due("DUE;TZID=Asia/Kolkata:20261102T090000")).toMatchObject({ dueTime: "04:30" });
  });

  it("a zoned time around a switch: the first of two, before the gap (RFC 5545 §3.3.5)", () => {
    const at = (value: string, tzid: string) =>
      readDate({ name: "DUE", params: { TZID: tzid }, value })?.at.toISOString();
    // The RFC's own example: 02:30 does not exist that night and is 3:30 EDT.
    expect(at("20070311T023000", "America/New_York")).toBe("2007-03-11T07:30:00.000Z");
    expect(at("20260308T023000", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
    // 01:30 comes twice in New York, 02:30 in Berlin: the first is on summer time.
    expect(at("20261101T013000", "America/New_York")).toBe("2026-11-01T05:30:00.000Z");
    expect(at("20261025T023000", "Europe/Berlin")).toBe("2026-10-25T00:30:00.000Z");
    expect(at("20260310T090000", "America/New_York")).toBe("2026-03-10T13:00:00.000Z");
    expect(at("20260324T090000", "Europe/Berlin")).toBe("2026-03-24T08:00:00.000Z");
  });

  it('a TZID with the prefix "/" is read in the IANA zone it ends in', () => {
    const due = (tzid: string) =>
      readDate({ name: "DUE", params: { TZID: tzid }, value: "20261102T090000" });
    expect(due("/mozilla.org/20070129_1/America/New_York")).toMatchObject({
      day: "2026-11-02",
      time: "15:00",
    });
    expect(due("/freeassociation.sourceforge.net/Tzfile/America/New_York")).toMatchObject({
      time: "15:00",
    });
    expect(due("/example.org/Nowhere")).toMatchObject({ time: "09:00" });
  });

  it("a floating due time, or one in a zone Intl does not know, is Berlin time", () => {
    const due = (line: string) => readVtodo(todo(["UID:x", "SUMMARY:A", line]));
    expect(due("DUE:20261102T090000")).toMatchObject({ dueDate: "2026-11-02", dueTime: "09:00" });
    expect(due('DUE;TZID="W. Europe Standard Time":20261102T090000')).toMatchObject({
      dueDate: "2026-11-02",
      dueTime: "09:00",
    });
  });

  it("a due day or time that does not exist is no due date", () => {
    const due = (line: string) => readVtodo(todo(["UID:x", "SUMMARY:A", line]));
    for (const line of [
      "DUE;VALUE=DATE:20260431",
      "DUE;VALUE=DATE:20261305",
      "DUE;VALUE=DATE:20270229",
      "DUE:20261102T250000",
      "DUE;TZID=Europe/Berlin:20261102T096000",
    ]) {
      expect(due(line)).toMatchObject({ dueDate: null, dueTime: null, remindAt: null });
    }
    expect(due("DUE;VALUE=DATE:20280229")).toMatchObject({ dueDate: "2028-02-29" });
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
