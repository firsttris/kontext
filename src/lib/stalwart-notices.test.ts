import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./jscalendar";
import {
  type EventNotice,
  eventChange,
  eventNow,
  isGranted,
  isShownShare,
  type ShareNotice,
} from "./stalwart-notices";

const event: CalendarEvent = {
  id: "",
  calendarIds: { a: true },
  title: "Heizung Müller",
  start: "2026-11-10T09:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H",
};

const notice = (
  type: EventNotice["type"],
  eventPatch: EventNotice["eventPatch"] = null,
): EventNotice => ({
  id: "n1",
  created: "2026-11-05T10:00:00Z",
  changedBy: { name: "Sandra Klein", email: "sandra@weber-haustechnik.test" },
  type,
  calendarEventId: "e1",
  event,
  eventPatch,
});

const share = (
  objectType: string,
  oldRights: Record<string, boolean>,
  newRights: Record<string, boolean>,
): ShareNotice => ({
  id: "s1",
  created: "2026-11-05T10:00:00Z",
  changedBy: { name: "Anna Weber" },
  objectType,
  objectAccountId: "anna",
  objectId: "c1",
  oldRights,
  newRights,
});

describe("eventChange", () => {
  it("calls a new start or length a move", () => {
    expect(eventChange(notice("updated", { start: "2026-11-11T09:00:00" }))).toBe("moved");
    expect(eventChange(notice("updated", { duration: "PT2H" }))).toBe("moved");
  });

  it("calls a deleted or cancelled event cancelled", () => {
    expect(eventChange(notice("destroyed"))).toBe("cancelled");
    expect(eventChange(notice("updated", { status: "cancelled" }))).toBe("cancelled");
  });

  it("calls other edits a change", () => {
    expect(eventChange(notice("updated", { title: "Heizung Meyer" }))).toBe("changed");
    expect(eventChange(notice("updated", { "locations/l1/name": "Lager" }))).toBe("changed");
  });

  it("leaves out new events and participants' answers", () => {
    expect(eventChange(notice("created"))).toBeNull();
    expect(
      eventChange(
        notice("updated", { "participants/p1/participationStatus": "accepted", sequence: 2 }),
      ),
    ).toBeNull();
    // Stalwart counts the sequence up with every change (seen on 1.0.3).
    expect(eventChange(notice("updated", { title: "Neu", sequence: 2 }))).toBe("changed");
  });
});

describe("eventChange of what Kontext's server wrote", () => {
  // A subscribed calendar (server/subscriptions/) is written with the server's key; Stalwart
  // records each changed or dropped event of the feed as someone else's change (seen on 1.0.3).
  const by = (changedBy: EventNotice["changedBy"]) => ({
    ...notice("updated", { title: "Restmüll (verlegt)", sequence: 1 }),
    changedBy,
  });

  it("leaves out the changes of the server's account and of the admin without an address", () => {
    expect(
      eventChange(
        by({ name: "Kontext-Server (Firmenverwaltung)", email: "kontext-server@firma.de" }),
      ),
    ).toBeNull();
    expect(
      eventChange({
        ...by({ name: "Recovery admin account", email: null }),
        type: "destroyed",
      }),
    ).toBeNull();
  });

  it("keeps colleagues and an outside organizer", () => {
    expect(eventChange(by({ name: "Sandra Klein", email: "sandra@firma.de" }))).toBe("changed");
    expect(eventChange(by({ name: "kunde@example.test", email: "kunde@example.test" }))).toBe(
      "changed",
    );
  });
});

describe("eventNow", () => {
  it("applies the patch's whole properties to the snapshot before the change", () => {
    const now = eventNow(
      notice("updated", { start: "2026-11-11T14:00:00", "locations/l1/name": "Lager" }),
    );
    expect(now?.start).toBe("2026-11-11T14:00:00");
    expect(now?.title).toBe("Heizung Müller");
    expect(now).not.toHaveProperty("locations/l1/name");
  });

  it("is null without a snapshot", () => {
    expect(eventNow({ ...notice("destroyed"), event: null })).toBeNull();
  });
});

describe("shares", () => {
  it("tells a grant to read from a revocation", () => {
    expect(isGranted(share("Calendar", {}, { mayReadItems: true }))).toBe(true);
    expect(isGranted(share("Calendar", { mayReadItems: true }, { mayReadItems: false }))).toBe(
      false,
    );
    expect(isGranted(share("AddressBook", {}, { mayRead: true }))).toBe(true);
  });

  it("shows calendars and address books one may read now or no longer", () => {
    expect(isShownShare(share("Calendar", {}, { mayReadItems: true }))).toBe(true);
    expect(isShownShare(share("Calendar", { mayReadItems: true }, {}))).toBe(true);
    expect(isShownShare(share("AddressBook", {}, { mayRead: true }))).toBe(true);
  });

  it("leaves out free and busy times, more rights and mail folders", () => {
    expect(isShownShare(share("Calendar", {}, { mayReadFreeBusy: true }))).toBe(false);
    expect(
      isShownShare(
        share("Calendar", { mayReadItems: true }, { mayReadItems: true, mayWriteAll: true }),
      ),
    ).toBe(false);
    expect(isShownShare(share("Mailbox", {}, { mayReadItems: true }))).toBe(false);
  });
});
