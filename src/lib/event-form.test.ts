import { describe, expect, it } from "vitest";
import {
  eventToForm,
  formToEvent,
  localDiff,
  movePatch,
  newEventForm,
  seriesStart,
  shiftLocal,
  validateEventForm,
} from "./event-form";
import type { CalendarEvent } from "./jscalendar";

describe("forms", () => {
  const me = { email: "jonas@weber.test", name: "Jonas" };
  it("validates title and order", () => {
    expect(validateEventForm({ ...newEventForm("2026-10-23T10:00:00"), title: "" })).toBe("title");
    expect(
      validateEventForm({ ...newEventForm("2026-10-23T10:00:00"), title: "x", endTime: "09:00" }),
    ).toBe("order");
    expect(validateEventForm({ ...newEventForm("2026-10-23T10:00:00"), title: "x" })).toBe(null);
  });
  it("writes a timed event with attendees and reads it back", () => {
    const form = {
      ...newEventForm("2026-10-23T10:00:00", 90),
      title: "Baubesprechung",
      attendees: "anna@weber.test",
      location: "Werkstatt",
    };
    const written = formToEvent(form, me);
    expect(written).toMatchObject({
      title: "Baubesprechung",
      start: "2026-10-23T10:00:00",
      timeZone: "Europe/Berlin",
      duration: "PT1H30M",
      organizerCalendarAddress: "mailto:jonas@weber.test",
    });
    const read = eventToForm(
      { ...(written as unknown as CalendarEvent), id: "x", calendarIds: {} },
      [me.email],
    );
    expect(read).toMatchObject({
      date: "2026-10-23",
      startTime: "10:00",
      endTime: "11:30",
      attendees: "anna@weber.test",
      location: "Werkstatt",
    });
  });
  it("writes an all-day event over two days", () => {
    const form = {
      ...newEventForm("2026-10-23T00:00:00"),
      title: "Urlaub",
      allDay: true,
      endDate: "2026-10-24",
    };
    expect(formToEvent(form, me)).toMatchObject({
      start: "2026-10-23T00:00:00",
      duration: "P2D",
      showWithoutTime: true,
      participants: null,
    });
  });
});

describe("repeating", () => {
  const me = { email: "jonas@weber.test" };
  it("writes the rule only for the series", () => {
    const form = {
      ...newEventForm("2026-10-26T08:00:00", 30),
      title: "Wochenrunde",
      recurrence: {
        repeat: "weekly",
        repeatEnd: "count",
        repeatCount: 4,
        repeatUntil: "",
      } as const,
    };
    expect(formToEvent(form, me).recurrenceRule).toEqual({
      "@type": "RecurrenceRule",
      frequency: "weekly",
      count: 4,
    });
    expect(formToEvent(form, me, undefined, false)).not.toHaveProperty("recurrenceRule");
    expect(formToEvent(newEventForm("2026-10-26T08:00:00"), me).recurrenceRule).toBeNull();
  });
  it("reads the rule from the series, not from the instance", () => {
    const series = {
      id: "c",
      calendarIds: {},
      start: "2026-10-26T08:00:00",
      timeZone: "Europe/Berlin",
      recurrenceRule: { frequency: "daily", until: "2026-11-30T23:59:59" },
    } as CalendarEvent;
    const instance = {
      ...series,
      id: "i",
      start: "2026-11-02T08:00:00",
      recurrenceRule: null,
      baseEventId: "c",
    };
    expect(eventToForm(instance, [], series).recurrence).toEqual({
      repeat: "daily",
      repeatEnd: "until",
      repeatCount: 10,
      repeatUntil: "2026-11-30",
    });
  });
  it("wants an end date not before the start", () => {
    const form = {
      ...newEventForm("2026-10-26T08:00:00"),
      title: "x",
      recurrence: {
        repeat: "daily",
        repeatEnd: "until",
        repeatCount: 10,
        repeatUntil: "2026-10-01",
      } as const,
    };
    expect(validateEventForm(form)).toBe("repeatEnd");
  });
  it("moves the series by what an instance moved", () => {
    expect(shiftLocal("2026-10-26T08:00:00", 90)).toBe("2026-10-26T09:30:00");
    expect(localDiff("2026-11-02T08:00:00", "2026-11-03T09:00:00")).toBe(1500);
    // Across the end of summer time the wall clock stays the same.
    expect(seriesStart("2026-10-19T08:00:00", "2026-11-02T08:00:00", "2026-11-02T10:00:00")).toBe(
      "2026-10-19T10:00:00",
    );
  });
});

describe("movePatch", () => {
  it("keeps the event's own zone and a minimum length", () => {
    const event = {
      id: "x",
      calendarIds: {},
      start: "2026-10-23T10:00:00",
      timeZone: "Europe/Berlin",
    } as CalendarEvent;
    expect(movePatch(event, new Date("2026-10-24T07:15:00Z"))).toEqual({
      start: "2026-10-24T09:15:00",
    });
    expect(movePatch(event, new Date("2026-10-24T07:15:00Z"), 5)).toEqual({
      start: "2026-10-24T09:15:00",
      duration: "PT15M",
    });
  });
});
