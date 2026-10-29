import { describe, expect, it } from "vitest";
import type { BodyPart } from "@/jmap/types";
import type { CalendarEvent } from "./jscalendar";
import {
  calendarPart,
  importable,
  invitationCard,
  isCalendarAlternative,
  type ParsedEvent,
  receivedInvitation,
} from "./received-invitation";

const ANNA = "anna@weber-haustechnik.test";
const JONAS = "jonas@weber-haustechnik.test";

const part = (extra: Partial<BodyPart>): BodyPart => ({
  partId: "4",
  blobId: "b4",
  type: "text/calendar",
  name: null,
  size: 900,
  cid: null,
  disposition: null,
  ...extra,
});

const parsed = (extra: Partial<ParsedEvent> = {}): ParsedEvent => ({
  method: "request",
  uid: "u1",
  sequence: 0,
  title: "Abnahme Heizung",
  start: "2026-11-20T14:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H",
  organizerCalendarAddress: `mailto:${JONAS}`,
  participants: {
    o: { calendarAddress: `mailto:${JONAS}`, name: "Jonas Weber", roles: { owner: true } },
    a: { calendarAddress: `mailto:${ANNA}`, participationStatus: "needs-action" },
  },
  ...extra,
});

const stored = (extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  ...importable(parsed()),
  start: "2026-11-20T14:00:00",
  id: "c",
  calendarIds: { b: true },
  participants: {
    o: { calendarAddress: `mailto:${JONAS}`, name: "Jonas Weber", roles: { owner: true } },
    s: { calendarAddress: `mailto:${ANNA}`, participationStatus: "tentative" },
  },
  ...extra,
});

describe("calendarPart", () => {
  it("finds the text/calendar part, not the attached file", () => {
    const file = part({ partId: "5", type: "application/ics", name: "invite.ics" });
    expect(calendarPart([file, part({ type: "Text/Calendar" })])?.partId).toBe("4");
    expect(calendarPart([file])).toBeUndefined();
  });

  it("hides only the alternative from the attachments", () => {
    expect(isCalendarAlternative(part({}))).toBe(true);
    expect(isCalendarAlternative(part({ name: "invite.ics" }))).toBe(false);
    expect(isCalendarAlternative(part({ disposition: "attachment" }))).toBe(false);
    expect(isCalendarAlternative(part({ type: "application/pdf" }))).toBe(false);
  });
});

describe("receivedInvitation", () => {
  it("takes the event itself, not a changed date of it", () => {
    const date = parsed({ recurrenceId: "2026-11-27T14:00:00", title: "Verschoben" });
    expect(receivedInvitation([date, parsed()])?.event.title).toBe("Abnahme Heizung");
  });

  it("knows invitations and cancellations, not replies or plain files", () => {
    expect(receivedInvitation([parsed({ method: "CANCEL" })])?.method).toBe("cancel");
    expect(receivedInvitation([parsed({ method: "reply" })])).toBeNull();
    expect(receivedInvitation([parsed({ method: undefined })])).toBeNull();
    expect(receivedInvitation([])).toBeNull();
  });
});

describe("invitationCard", () => {
  const request = receivedInvitation([parsed()]);

  it("answers the event in the own calendar, with the status there", () => {
    const card = invitationCard({ received: request, stored: stored(), mine: [ANNA] })!;
    expect(card.organizer).toBe("Jonas Weber");
    expect(card.me).toEqual(["s", expect.objectContaining({ participationStatus: "tentative" })]);
    expect(card).toMatchObject({ kind: "request", canAnswer: true, canRemove: false });
    expect(card.outdated).toBe(false);
  });

  it("answers an invitation not yet in the calendar from the mail", () => {
    const card = invitationCard({ received: request, stored: null, mine: [ANNA] })!;
    expect(card.me?.[0]).toBe("a");
    expect(card.canAnswer).toBe(true);
  });

  it("shows nothing on the organizer's own copy", () => {
    expect(invitationCard({ received: request, stored: null, mine: [JONAS] })).toBeNull();
    expect(invitationCard({ received: null, stored: null, mine: [ANNA] })).toBeNull();
  });

  it("offers no answer to someone not invited, such as a forwarded invitation", () => {
    const card = invitationCard({ received: request, stored: null, mine: ["max@x.test"] })!;
    expect(card.canAnswer).toBe(false);
  });

  it("can't take a single date of a series into the calendar", () => {
    const date = receivedInvitation([parsed({ recurrenceId: "2026-11-27T14:00:00" })]);
    expect(invitationCard({ received: date, stored: null, mine: [ANNA] })!.canAnswer).toBe(false);
    expect(invitationCard({ received: date, stored: stored(), mine: [ANNA] })!.canAnswer).toBe(
      true,
    );
  });

  it("knows when the organizer changed the event since", () => {
    const card = invitationCard({
      received: request,
      stored: stored({ sequence: 2 }),
      mine: [ANNA],
    });
    expect(card!.outdated).toBe(true);
  });

  it("offers to remove a cancelled event, no answer", () => {
    const cancel = receivedInvitation([parsed({ method: "cancel", sequence: 1 })]);
    const there = invitationCard({ received: cancel, stored: stored(), mine: [ANNA] })!;
    expect(there).toMatchObject({ kind: "cancel", canAnswer: false, canRemove: true });
    const gone = invitationCard({ received: cancel, stored: null, mine: [ANNA] })!;
    expect(gone.canRemove).toBe(false);
  });

  it("removes no whole series for the cancellation of a single date", () => {
    const date = receivedInvitation([
      parsed({ method: "cancel", sequence: 1, recurrenceId: "2026-11-27T14:00:00" }),
    ]);
    const card = invitationCard({ received: date, stored: stored(), mine: [ANNA] })!;
    expect(card.canRemove).toBe(false);
  });

  it("removes no event the organizer invited to again after this cancellation", () => {
    const cancel = receivedInvitation([parsed({ method: "cancel", sequence: 1 })]);
    const card = invitationCard({
      received: cancel,
      stored: stored({ sequence: 2, status: "confirmed" }),
      mine: [ANNA],
    })!;
    expect(card.canRemove).toBe(false);
  });

  it("answers no invitation whose event was called off since", () => {
    const card = invitationCard({
      received: request,
      stored: stored({ status: "cancelled", sequence: 1 }),
      mine: [ANNA],
    });
    expect(card!.canAnswer).toBe(false);
  });
});

describe("importable", () => {
  it("leaves out the method and the conversion notes", () => {
    const event = importable({ ...parsed(), iCalendar: { name: "vevent" } });
    expect(event).not.toHaveProperty("method");
    expect(event).not.toHaveProperty("iCalendar");
    expect(event.uid).toBe("u1");
  });
});
