import { describe, expect, it } from "vitest";
import { changesIn, offsetAt, vtimezone } from "./ical-zone";

describe("offsets", () => {
  it("reads summer and winter time of Berlin", () => {
    expect(offsetAt("Europe/Berlin", new Date("2026-01-15T12:00:00Z"))).toBe(60);
    expect(offsetAt("Europe/Berlin", new Date("2026-07-15T12:00:00Z"))).toBe(120);
    expect(offsetAt("Asia/Kolkata", new Date("2026-07-15T12:00:00Z"))).toBe(330);
    expect(offsetAt("America/New_York", new Date("2026-01-15T12:00:00Z"))).toBe(-300);
  });

  it("finds the changes to the minute", () => {
    expect(changesIn("Europe/Berlin", 2026, 2026)).toEqual([
      { at: Date.parse("2026-03-29T01:00:00Z"), from: 60, to: 120 },
      { at: Date.parse("2026-10-25T01:00:00Z"), from: 120, to: 60 },
    ]);
  });
});

describe("vtimezone", () => {
  it("writes Berlin as two yearly rules", () => {
    expect(vtimezone("Europe/Berlin", 2026)).toEqual([
      "BEGIN:VTIMEZONE",
      "TZID:Europe/Berlin",
      "BEGIN:DAYLIGHT",
      "DTSTART:20240331T020000",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
      "TZOFFSETFROM:+0100",
      "TZOFFSETTO:+0200",
      "END:DAYLIGHT",
      "BEGIN:STANDARD",
      "DTSTART:20241027T030000",
      "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
      "TZOFFSETFROM:+0200",
      "TZOFFSETTO:+0100",
      "END:STANDARD",
      "END:VTIMEZONE",
    ]);
  });

  it("writes the second Sunday in March for New York", () => {
    const lines = vtimezone("America/New_York", 2026);
    expect(lines).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU");
    expect(lines).toContain("RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU");
    expect(lines).toContain("TZOFFSETTO:-0400");
  });

  it("writes a zone without summer time as one offset", () => {
    expect(vtimezone("Asia/Kolkata", 2026)).toEqual([
      "BEGIN:VTIMEZONE",
      "TZID:Asia/Kolkata",
      "BEGIN:STANDARD",
      "DTSTART:19700101T000000",
      "TZOFFSETFROM:+0530",
      "TZOFFSETTO:+0530",
      "END:STANDARD",
      "END:VTIMEZONE",
    ]);
  });
});
