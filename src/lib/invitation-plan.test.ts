import { describe, expect, it } from "vitest";
import { isSignificantChange, planInvitations } from "./invitation-plan";
import type { CalendarEvent, Participant } from "./jscalendar";

const NOW = new Date("2026-10-27T12:00:00Z");
const ME = "jonas@weber-haustechnik.test";

const person = (email: string, extra: Partial<Participant> = {}): Participant => ({
  calendarAddress: `mailto:${email}`,
  roles: { attendee: true },
  participationStatus: "needs-action",
  expectReply: true,
  ...extra,
});

const event = (extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e1",
  uid: "u1",
  calendarIds: { b: true },
  title: "Abnahme",
  start: "2026-11-20T15:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H",
  organizerCalendarAddress: `mailto:${ME}`,
  participants: {
    o: { name: "Jonas", calendarAddress: `mailto:${ME}`, roles: { owner: true, attendee: true } },
    a: person("anna@weber-haustechnik.test", { name: "Anna Weber" }),
    k: person("Markus@Hoffmann.test"),
  },
  ...extra,
});

const summary = (planned: ReturnType<typeof planInvitations>) =>
  planned.map(({ kind, email }) => `${kind} ${email}`);

describe("planInvitations", () => {
  it("invites everyone but the organizer to a new event", () => {
    const planned = planInvitations({ before: null, after: event(), mine: [ME], now: NOW });
    expect(summary(planned)).toEqual([
      "invite anna@weber-haustechnik.test",
      "invite markus@hoffmann.test",
    ]);
    expect(planned[0]!.name).toBe("Anna Weber");
  });

  it("sends nothing when someone else organizes it", () => {
    expect(
      planInvitations({
        before: null,
        after: event(),
        mine: ["anna@weber-haustechnik.test"],
        now: NOW,
      }),
    ).toEqual([]);
  });

  it("sends nothing for an event that is over", () => {
    const past = event({ start: "2026-10-01T10:00:00" });
    expect(planInvitations({ before: null, after: past, mine: [ME], now: NOW })).toEqual([]);
    // A series goes on.
    const series = { ...past, recurrenceRule: { frequency: "weekly" as const } };
    expect(planInvitations({ before: null, after: series, mine: [ME], now: NOW })).toHaveLength(2);
  });

  it("tells of a change, except those who declined, invites the new and uninvites the gone", () => {
    const before = event({
      participants: {
        ...event().participants,
        d: person("dieter@kunde.test", { participationStatus: "declined" }),
      },
    });
    const { k: _gone, ...kept } = before.participants!;
    const after = event({
      start: "2026-11-20T16:00:00",
      participants: { ...kept, n: person("neu@kunde.test") },
    });
    const planned = planInvitations({ before, after, mine: [ME], now: NOW });
    expect(summary(planned)).toEqual([
      "update anna@weber-haustechnik.test",
      "invite neu@kunde.test",
      "removed markus@hoffmann.test",
    ]);
    expect(planned.find((p) => p.kind === "update")!.event.start).toBe("2026-11-20T16:00:00");
    // The one taken off hears with a higher sequence, of the event as it was.
    const removed = planned.find((p) => p.kind === "removed")!.event;
    expect(removed.sequence).toBe(1);
    expect(removed.start).toBe("2026-11-20T15:00:00");
  });

  it("only invites the new attendee when nothing else changed", () => {
    const after = event({ participants: { ...event().participants, n: person("neu@kunde.test") } });
    expect(summary(planInvitations({ before: event(), after, mine: [ME], now: NOW }))).toEqual([
      "invite neu@kunde.test",
    ]);
  });

  it("cancels for everyone when the event is deleted", () => {
    const planned = planInvitations({
      before: event({ sequence: 3 }),
      after: null,
      mine: [ME],
      now: NOW,
    });
    expect(summary(planned)).toEqual([
      "cancel anna@weber-haustechnik.test",
      "cancel markus@hoffmann.test",
    ]);
    expect(planned[0]!.event.sequence).toBe(4);
  });

  it("goes by the organizer's address without regard to case or mailto", () => {
    expect(
      planInvitations({
        before: null,
        after: event(),
        mine: ["JONAS@weber-haustechnik.test"],
        now: NOW,
      }),
    ).toHaveLength(2);
  });
});

describe("isSignificantChange", () => {
  it("counts time, place, title, notes and repetition", () => {
    expect(isSignificantChange(event(), event({ duration: "PT2H" }))).toBe(true);
    expect(isSignificantChange(event(), event({ locations: { l: { name: "Baustelle" } } }))).toBe(
      true,
    );
    expect(isSignificantChange(event(), event({ recurrenceRule: { frequency: "daily" } }))).toBe(
      true,
    );
    expect(isSignificantChange(event(), event({ description: "Neu" }))).toBe(true);
  });

  it("does not count answers, who comes, or the order of keys", () => {
    const answered = event();
    answered.participants!.a = { ...answered.participants!.a!, participationStatus: "accepted" };
    expect(isSignificantChange(event(), answered)).toBe(false);
    expect(
      isSignificantChange(
        event({ recurrenceOverrides: { "2026-11-27T15:00:00": { title: "X" } } }),
        event({
          recurrenceOverrides: {
            "2026-11-27T15:00:00": { "participants/a/participationStatus": "declined", title: "X" },
          },
        }),
      ),
    ).toBe(false);
  });
});
