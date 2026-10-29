import { describe, expect, it } from "vitest";
import { copyForm, copyToEvent } from "./event-copy";
import type { CalendarEvent } from "./jscalendar";
import { NO_REPEAT } from "./recurrence";

const me = { email: "jonas@weber.test", name: "Jonas" };
const meeting = "https://kontext.weber.test/meet/abcdefghijklmnop";

const original: CalendarEvent = {
  id: "e1",
  uid: "uid-of-the-original",
  calendarIds: { c: true },
  title: "Baubesprechung Neubau",
  description: "Pläne mitbringen",
  start: "2026-11-04T10:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H30M",
  locations: { l: { name: "Baustelle Hauptstraße 5" } },
  virtualLocations: { "kontext-meeting": { name: "Videobesprechung", uri: meeting } },
  participants: {
    organizer: {
      calendarAddress: "mailto:jonas@weber.test",
      roles: { owner: true, attendee: true },
      participationStatus: "accepted",
    },
    a0: {
      calendarAddress: "mailto:anna@weber.test",
      roles: { attendee: true },
      participationStatus: "accepted",
    },
  },
  links: {
    "kontext-document-d1": { href: "https://kontext.weber.test/documents/edit/d1", title: "Plan" },
  },
  freeBusyStatus: "free",
  alerts: {
    r: {
      "@type": "Alert",
      trigger: { "@type": "OffsetTrigger", offset: "-PT1H", relativeTo: "start" },
      action: "email",
    },
  },
};

describe("copyForm", () => {
  it("takes everything the form holds, on the original's date", () => {
    expect(copyForm(original, [me.email])).toEqual({
      title: "Baubesprechung Neubau",
      date: "2026-11-04",
      startTime: "10:00",
      endDate: "2026-11-04",
      endTime: "11:30",
      allDay: false,
      location: "Baustelle Hauptstraße 5",
      meeting,
      attendees: "anna@weber.test",
      showAs: "free",
      description: "Pläne mitbringen",
      recurrence: NO_REPEAT,
      reminder: { minutes: 60, action: "email" },
      documents: [{ id: "d1", name: "Plan", href: "https://kontext.weber.test/documents/edit/d1" }],
    });
  });

  it("copies one date of a series without the series' rule", () => {
    const instance: CalendarEvent = {
      ...original,
      start: "2026-11-11T10:00:00",
      recurrenceId: "2026-11-11T10:00:00",
      baseEventId: "series",
      recurrenceRule: { frequency: "weekly" },
    };
    expect(copyForm(instance, [me.email])).toMatchObject({
      date: "2026-11-11",
      recurrence: NO_REPEAT,
    });
  });
});

describe("copyToEvent", () => {
  it("writes a new event: attendees invited afresh, nothing of the original's identity", () => {
    const data = copyToEvent(copyForm(original, [me.email]), me, original);
    expect(data).toMatchObject({
      title: "Baubesprechung Neubau",
      start: "2026-11-04T10:00:00",
      duration: "PT1H30M",
      freeBusyStatus: "free",
      organizerCalendarAddress: "mailto:jonas@weber.test",
      virtualLocations: { "kontext-meeting": { uri: meeting } },
      links: { "kontext-document-d1": { title: "Plan" } },
    });
    const participants = data.participants as Record<string, { participationStatus: string }>;
    expect(participants.a0?.participationStatus).toBe("needs-action");
    expect(data).not.toHaveProperty("uid");
    expect(data).not.toHaveProperty("recurrenceOverrides");
    expect(data.recurrenceRule ?? null).toBeNull();
  });

  it("keeps alerts the form cannot show, not acknowledged", () => {
    const alerts = {
      a: { trigger: { "@type": "AbsoluteTrigger" }, action: "display", acknowledged: "x" },
      b: { trigger: { "@type": "OffsetTrigger", offset: "-PT5M" }, action: "display" },
    };
    const kept = { ...original, alerts } as CalendarEvent;
    const data = copyToEvent(copyForm(kept, [me.email]), me, kept);
    expect(data.alerts).toEqual({
      a: { trigger: { "@type": "AbsoluteTrigger" }, action: "display" },
      b: alerts.b,
    });
  });

  it("leaves out a snooze of the original's reminder", () => {
    // A snooze is a child alert of the one it delays (RFC 8984 §4.5.2, relatedTo with parent),
    // with an absolute time for the original's date; Apple Calendar writes it over CalDAV.
    const reminder = {
      trigger: { "@type": "OffsetTrigger", offset: "-PT15M" },
      action: "display",
    };
    const alerts = {
      r: { ...reminder, acknowledged: "2026-11-04T09:45:00Z" },
      s: {
        trigger: { "@type": "AbsoluteTrigger", when: "2026-11-04T09:55:00Z" },
        action: "display",
        relatedTo: { r: { "@type": "Relation", relation: { parent: true } } },
      },
    };
    const snoozed = { ...original, alerts } as CalendarEvent;
    const data = copyToEvent(copyForm(snoozed, [me.email]), me, snoozed);
    expect(data.alerts).toEqual({ r: reminder });
  });
});
