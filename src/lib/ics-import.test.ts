import { describe, expect, it } from "vitest";
import { fileEvents, importPlan, type ParsedEntry, prepareEvent } from "./ics-import";

/** As Stalwart's CalendarEvent/parse gives them (see the probe in the pull request). */
const series: ParsedEntry = {
  "@type": "Event",
  uid: "series-1@test",
  title: "Teamrunde",
  start: "2026-11-05T09:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H",
  recurrenceRule: { frequency: "weekly", count: 5 },
  recurrenceOverrides: { "2026-11-12T09:00:00": { start: "2026-11-12T11:00:00" } },
  method: "publish",
};
const allDay: ParsedEntry = {
  "@type": "Event",
  uid: "allday@test",
  title: "Betriebsausflug",
  start: "2026-11-02T00:00:00",
  duration: "P1D",
  showWithoutTime: true,
  updated: "2026-10-01T10:00:00Z",
};

describe("prepareEvent", () => {
  it("drops what only describes the file and Outlook's empty category", () => {
    expect(
      prepareEvent(
        { title: "T", keywords: { NONE: true }, calendarIds: { x: true }, method: "request" },
        "c",
        "u",
      ),
    ).toEqual({ title: "T", uid: "u", calendarIds: { c: true } });
  });

  it("keeps the changed dates of a series and real categories", () => {
    const event = prepareEvent({ ...series, keywords: { Kunde: true } }, "c", "series-1@test");
    expect(event.recurrenceOverrides).toEqual(series.recurrenceOverrides);
    expect(event.keywords).toEqual({ Kunde: true });
    expect(event.method).toBeUndefined();
  });

  it("makes a changed date without its series an appointment of its own", () => {
    const event = prepareEvent(
      { uid: "x", start: "2026-11-12T11:00:00", recurrenceId: "2026-11-12T09:00:00" },
      "c",
      "x",
    );
    expect(event).toEqual({ uid: "x", start: "2026-11-12T11:00:00", calendarIds: { c: true } });
  });
});

describe("fileEvents", () => {
  it("gives one appointment per UID with what the preview shows", () => {
    const [first, second] = fileEvents([series, allDay]);
    expect(first).toMatchObject({ uid: "series-1@test", title: "Teamrunde", repeats: true });
    expect(first!.when).toEqual({
      start: "2026-11-05T09:00:00",
      duration: "PT1H",
      timeZone: "Europe/Berlin",
      showWithoutTime: undefined,
    });
    expect(second).toMatchObject({ uid: "allday@test", repeats: false });
  });

  it("prefers the series over a changed date of it and the first of twins", () => {
    const change = { uid: "series-1@test", start: "2026-11-12T11:00:00", recurrenceId: "x" };
    const twin = { ...series, title: "Doppelt" };
    expect(fileEvents([change, series, twin]).map((item) => item.title)).toEqual(["Teamrunde"]);
  });

  it("skips entries without a start and finds one without UID again by its content", () => {
    const { uid: _, ...noUid } = allDay;
    const once = fileEvents([noUid, { title: "ohne Beginn" }]);
    const again = fileEvents([{ ...noUid, updated: "2026-10-29T08:00:00Z" }]);
    expect(once).toHaveLength(1);
    expect(once[0]!.uid).toMatch(/^import-/);
    expect(again[0]!.uid).toBe(once[0]!.uid);
  });

  it("finds one without UID again whatever order Stalwart gives its properties in", () => {
    // CalendarEvent/parse returns the keys in another order each time (probed on 0.16.27).
    const entry: ParsedEntry = {
      title: "Ohne UID",
      start: "2026-11-20T00:00:00",
      showWithoutTime: true,
      iCalendar: {
        name: "vevent",
        convertedProperties: { start: { parameters: { value: "DATE" } } },
      },
    };
    const reordered: ParsedEntry = {
      iCalendar: {
        convertedProperties: { start: { parameters: { value: "DATE" } } },
        name: "vevent",
      },
      showWithoutTime: true,
      start: "2026-11-20T00:00:00",
      title: "Ohne UID",
    };
    expect(fileEvents([reordered])[0]!.uid).toBe(fileEvents([entry])[0]!.uid);
  });
});

describe("importPlan", () => {
  it("splits into new and already there, each by start", () => {
    const later = { ...allDay, uid: "later", start: "2026-12-01T00:00:00" };
    const plan = importPlan(fileEvents([later, series, allDay]), new Set(["allday@test"]));
    expect(plan.fresh.map((item) => item.uid)).toEqual(["series-1@test", "later"]);
    expect(plan.known.map((item) => item.uid)).toEqual(["allday@test"]);
  });
});
