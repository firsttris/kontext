import { describe, expect, it } from "vitest";
import type { BodyPart } from "@/jmap/types";
import type { CalendarEvent } from "./jscalendar";
import {
  importableEvent,
  invitationPart,
  invitationView,
  isInlineInvitation,
  mainEntry,
  myAttendee,
  type ParsedEvent,
} from "./mail-invitation";

const part = (type: string, name: string | null = null, blobId: string | null = "b"): BodyPart => ({
  partId: "1",
  blobId,
  type,
  name,
  size: 1,
  cid: null,
  disposition: null,
});

const parsed = (extra: Partial<ParsedEvent> = {}): ParsedEvent => ({
  id: "",
  uid: "u1",
  sequence: 0,
  calendarIds: {},
  title: "Abstimmung Elektro",
  start: "2026-11-05T10:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H",
  organizerCalendarAddress: "mailto:petra@keller-elektro.test",
  participants: {
    p: { calendarAddress: "mailto:petra@keller-elektro.test", name: "Petra Keller" },
    j: {
      calendarAddress: "mailto:Jonas@weber-haustechnik.test",
      participationStatus: "needs-action",
    },
  },
  method: "request",
  ...extra,
});
const mine = ["jonas@weber-haustechnik.test"];

describe("invitationPart", () => {
  it("takes the text/calendar part, else an .ics file", () => {
    expect(invitationPart([part("application/pdf"), part("text/calendar")])?.type).toBe(
      "text/calendar",
    );
    expect(invitationPart([part("application/octet-stream", "invite.ics")])?.name).toBe(
      "invite.ics",
    );
    expect(invitationPart([part("application/ics", "event.ics")])?.type).toBe("application/ics");
    expect(invitationPart([part("application/pdf", "plan.pdf")])).toBeUndefined();
    expect(invitationPart([part("text/calendar", null, null)])).toBeUndefined();
  });
});

describe("isInlineInvitation", () => {
  it("is the unnamed text/calendar part, not a named .ics file", () => {
    expect(isInlineInvitation(part("text/calendar"))).toBe(true);
    expect(isInlineInvitation(part("text/calendar", "invite.ics"))).toBe(false);
    expect(isInlineInvitation(part("application/ics", "event.ics"))).toBe(false);
  });
});

describe("mainEntry", () => {
  it("is the series, not a changed date of it", () => {
    const date = parsed({ recurrenceId: "2026-11-12T10:00:00" });
    const series = parsed();
    expect(mainEntry([date, series])).toBe(series);
    expect(mainEntry([date])).toBe(date);
    expect(mainEntry([])).toBeUndefined();
  });
});

describe("myAttendee", () => {
  it("finds the user by address, whatever the case, never as the organizer", () => {
    expect(myAttendee(parsed(), mine)?.[0]).toBe("j");
    expect(myAttendee(parsed(), ["petra@keller-elektro.test"])).toBeUndefined();
  });
});

describe("invitationView", () => {
  it("offers to answer an invitation not yet in the calendar", () => {
    expect(invitationView(parsed(), undefined, mine)).toEqual({
      kind: "request",
      status: "needs-action",
      inCalendar: false,
      outdated: false,
    });
  });

  it("shows the answer from the calendar and whether the mail is older", () => {
    const stored: CalendarEvent = {
      ...parsed(),
      id: "e1",
      sequence: 2,
      participants: {
        a: {
          calendarAddress: "mailto:jonas@weber-haustechnik.test",
          participationStatus: "accepted",
        },
      },
    };
    expect(invitationView(parsed({ sequence: 1 }), stored, mine)).toEqual({
      kind: "request",
      status: "accepted",
      inCalendar: true,
      outdated: true,
    });
  });

  it("has no answer for someone not invited (forwarded)", () => {
    expect(invitationView(parsed(), undefined, ["anna@weber-haustechnik.test"])).toMatchObject({
      kind: "request",
      status: null,
    });
  });

  it("knows called-off and published events", () => {
    expect(invitationView(parsed({ method: "cancel" }), undefined, mine)).toEqual({
      kind: "cancel",
      inCalendar: false,
    });
    expect(invitationView(parsed({ method: undefined }), undefined, mine)).toEqual({
      kind: "publish",
      inCalendar: false,
    });
  });

  it("shows nothing for the user's own invitations, answers or nothing parsed", () => {
    expect(invitationView(parsed(), undefined, ["petra@keller-elektro.test"])).toEqual({
      kind: "none",
    });
    expect(invitationView(parsed({ method: "reply" }), undefined, mine)).toEqual({ kind: "none" });
    expect(invitationView(undefined, undefined, mine)).toEqual({ kind: "none" });
  });
});

describe("importableEvent", () => {
  it("drops what describes the message and writes the answer", () => {
    const event = importableEvent(
      { ...parsed(), iCalendar: { name: "vevent" } } as ParsedEvent,
      mine,
      "tentative",
    );
    expect(event).not.toHaveProperty("method");
    expect(event).not.toHaveProperty("id");
    expect(event).not.toHaveProperty("iCalendar");
    expect(event["@type"]).toBe("Event");
    expect(event.uid).toBe("u1");
    expect(
      (event.participants as Record<string, { participationStatus: string }>).j
        ?.participationStatus,
    ).toBe("tentative");
  });

  it("keeps the participants as they came without an answer", () => {
    expect(importableEvent(parsed(), mine).participants).toEqual(parsed().participants);
  });
});
