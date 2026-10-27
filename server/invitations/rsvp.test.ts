// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Invocation, StalwartRequest } from "../company/management";
import { createRsvp } from "./rsvp";

const claim = {
  accountId: "jonas",
  eventId: "i",
  uid: "u1",
  email: "anna@weber-haustechnik.test",
  expiresAt: new Date("2027-01-01T00:00:00Z"),
};

const organizers = {
  id: "i",
  uid: "u1",
  title: "Abnahme",
  start: "2026-11-20T15:00:00",
  timeZone: "Europe/Berlin",
  duration: "PT1H",
  organizerCalendarAddress: "mailto:jonas@weber-haustechnik.test",
  participants: {
    o: { name: "Jonas Weber", calendarAddress: "mailto:jonas@weber-haustechnik.test" },
    a: {
      name: "Anna Weber",
      calendarAddress: "mailto:anna@weber-haustechnik.test",
      participationStatus: "needs-action",
    },
  },
};

/** Stalwart with the organizer's event, and Anna's own copy (another participant id). */
const fakeStalwart = (event: Record<string, unknown> | null = organizers) => {
  const writes: Invocation[] = [];
  const request: StalwartRequest = async (calls) =>
    calls.map(([method, args, id]): Invocation => {
      if (method === "CalendarEvent/get") {
        const list =
          args.accountId === "jonas"
            ? event
              ? [event]
              : []
            : [
                {
                  id: "c",
                  participants: { x: { calendarAddress: "mailto:anna@weber-haustechnik.test" } },
                },
              ];
        return [method, { list }, id];
      }
      if (method === "Principal/query") return [method, { ids: ["anna"] }, id];
      if (method === "CalendarEvent/query") return [method, { ids: ["c"] }, id];
      writes.push([method, args, id]);
      return [method, { updated: {} }, id];
    });
  return { request, writes };
};

describe("rsvp", () => {
  it("shows the event, the organizer first, and the attendee's answer so far", async () => {
    const { request } = fakeStalwart();
    const result = await createRsvp(request).load(claim);
    expect(result).toMatchObject({
      ok: true,
      view: {
        event: { title: "Abnahme", start: "2026-11-20T15:00:00" },
        organizer: { name: "Jonas Weber", email: "jonas@weber-haustechnik.test" },
        me: { email: "anna@weber-haustechnik.test", status: "needs-action" },
      },
    });
    if (result.ok) {
      expect(result.view.people.map((p) => `${p.email} ${p.status}`)).toEqual([
        "jonas@weber-haustechnik.test accepted",
        "anna@weber-haustechnik.test needs-action",
      ]);
      expect("participants" in result.view.event).toBe(false);
    }
  });

  it("enters the answer at the organizer and in the colleague's own copy", async () => {
    const { request, writes } = fakeStalwart();
    const result = await createRsvp(request).answer(claim, "tentative");
    expect(result.ok && result.view.me.status).toBe("tentative");
    expect(writes.map(([, args]) => args)).toEqual([
      {
        accountId: "jonas",
        sendSchedulingMessages: false,
        update: { i: { "participants/a/participationStatus": "tentative" } },
      },
      {
        accountId: "anna",
        sendSchedulingMessages: false,
        update: { c: { "participants/x/participationStatus": "tentative" } },
      },
    ]);
  });

  it("says when the event is gone, has another UID, or the attendee was taken off", async () => {
    expect(await createRsvp(fakeStalwart(null).request).load(claim)).toEqual({
      ok: false,
      error: "gone",
    });
    expect(
      await createRsvp(fakeStalwart({ ...organizers, uid: "other" }).request).load(claim),
    ).toEqual({
      ok: false,
      error: "gone",
    });
    const { request, writes } = fakeStalwart();
    expect(
      await createRsvp(request).answer(
        { ...claim, email: "max@weber-haustechnik.test" },
        "accepted",
      ),
    ).toEqual({
      ok: false,
      error: "not-invited",
    });
    expect(writes).toEqual([]);
  });
});
