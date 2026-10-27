// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { UserJmap } from "../external/user-jmap";
import { createInvitationRoutes, createRsvpRoutes, linksExpire } from "./routes";
import type { Rsvp, RsvpView } from "./rsvp";
import { createRsvpTokens } from "./token";

const SECRET = "a-secret-of-at-least-thirty-two-characters";
const NOW = new Date("2026-10-27T12:00:00Z");

const stored = {
  uid: "u1",
  organizerCalendarAddress: "mailto:jonas@weber-haustechnik.test",
  utcEnd: "2026-11-20T15:30:00Z",
  participants: {
    o: { calendarAddress: "mailto:jonas@weber-haustechnik.test" },
    a: { calendarAddress: "mailto:Anna@weber-haustechnik.test" },
    k: { calendarAddress: "mailto:markus@hoffmann.test" },
  },
};

const setup = async ({
  signedIn = true,
  senders = ["jonas@weber-haustechnik.test"],
  enabled = true,
} = {}) => {
  const tokens = await createRsvpTokens(SECRET);
  const asked: unknown[] = [];
  const jmap: UserJmap = {
    call: async <T>(calls: unknown[]) => {
      asked.push(calls);
      return [{ list: [stored] } as T];
    },
    download: async () => new Uint8Array(),
  };
  const app = createInvitationRoutes({
    tokens,
    publicUrl: "https://kontext.firma.de/",
    infoOf: async () => (signedIn ? { sessionId: "s1", accounts: [], name: "Jonas" } : null),
    sendersOf: async () => senders.map((email) => ({ email, name: "" })),
    jmapFor: async () => jmap,
    enabled,
    now: () => NOW,
  });
  const post = (body: unknown) =>
    app.request("/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { tokens, asked, post };
};

describe("/api/invitations/links", () => {
  it("signs a link per answer for each attendee but the organizer", async () => {
    const { tokens, asked, post } = await setup();
    const response = await post({ accountId: "d", eventId: "i" });
    expect(response.status).toBe(200);
    const { links } = (await response.json()) as { links: Record<string, Record<string, string>> };
    expect(Object.keys(links)).toEqual(["anna@weber-haustechnik.test", "markus@hoffmann.test"]);
    const yes = new URL(links["markus@hoffmann.test"]!.accepted!);
    expect(`${yes.origin}${yes.pathname}`).toBe("https://kontext.firma.de/rsvp");
    expect(yes.searchParams.get("r")).toBe("accepted");
    expect(await tokens.verify(yes.searchParams.get("t")!, NOW)).toEqual({
      accountId: "d",
      eventId: "i",
      uid: "u1",
      email: "markus@hoffmann.test",
      expiresAt: new Date("2027-01-19T15:30:00Z"),
    });
    // The event is read with the person's own token.
    expect(JSON.stringify(asked)).toContain('"CalendarEvent/get"');
  });

  it("only for the organizer, signed in, and with the server's key", async () => {
    expect(
      (await (await setup({ signedIn: false })).post({ accountId: "d", eventId: "i" })).status,
    ).toBe(401);
    expect(
      (
        await (
          await setup({ senders: ["anna@weber-haustechnik.test"] })
        ).post({ accountId: "d", eventId: "i" })
      ).status,
    ).toBe(403);
    const off = await (await setup({ enabled: false })).post({ accountId: "d", eventId: "i" });
    expect(await off.json()).toEqual({ links: {} });
    expect((await (await setup()).post({ accountId: "d" })).status).toBe(400);
  });
});

describe("linksExpire", () => {
  it("lasts past the event, the end of a series, or a year for an open one", () => {
    expect(linksExpire({ utcEnd: "2026-11-20T15:30:00Z" }, NOW).toISOString()).toBe(
      "2027-01-19T15:30:00.000Z",
    );
    expect(linksExpire({ utcEnd: "2026-01-01T00:00:00Z" }, NOW).toISOString()).toBe(
      "2026-12-26T12:00:00.000Z",
    );
    expect(
      linksExpire({ recurrenceRule: { until: "2027-03-29T09:00:00" } }, NOW).toISOString(),
    ).toBe("2027-05-28T23:59:59.000Z");
    expect(linksExpire({ recurrenceRule: {} }, NOW).getTime()).toBe(
      NOW.getTime() + 460 * 86_400_000,
    );
  });
});

const VIEW: RsvpView = {
  event: { title: "Abnahme", start: "2026-11-20T15:00:00", timeZone: "Europe/Berlin" },
  organizer: { name: "Jonas", email: "jonas@weber-haustechnik.test" },
  people: [],
  me: { email: "markus@hoffmann.test", status: "needs-action" },
};

describe("/api/rsvp", () => {
  const rsvpSetup = async (allowed = true) => {
    const tokens = await createRsvpTokens(SECRET);
    const answers: string[] = [];
    const tried: string[] = [];
    const rsvp: Rsvp = {
      load: async () => ({ ok: true, view: VIEW }),
      answer: async (claim, status) => {
        answers.push(`${claim.email} ${status}`);
        return { ok: true, view: { ...VIEW, me: { ...VIEW.me, status } } };
      },
    };
    const app = createRsvpRoutes({
      tokens,
      rsvp,
      mayTry: (key) => {
        tried.push(key);
        return allowed;
      },
      now: () => NOW,
    });
    const token = await tokens.sign({
      accountId: "d",
      eventId: "i",
      uid: "u1",
      email: "markus@hoffmann.test",
      expiresAt: new Date("2027-01-01T00:00:00Z"),
    });
    return { app, token, answers, tried };
  };

  it("shows the event and enters the answer for the token's attendee", async () => {
    const { app, token, answers, tried } = await rsvpSetup();
    const shown = await app.request(`/?t=${encodeURIComponent(token)}`, {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(shown.status).toBe(200);
    expect(((await shown.json()) as RsvpView).event.title).toBe("Abnahme");
    const answered = await app.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, status: "accepted" }),
    });
    expect(((await answered.json()) as RsvpView).me.status).toBe("accepted");
    expect(answers).toEqual(["markus@hoffmann.test accepted"]);
    expect(tried[0]).toBe("rsvp:203.0.113.7");
  });

  it("refuses a bad token, a bad answer and too many tries", async () => {
    const { app, token } = await rsvpSetup();
    expect((await app.request("/?t=nope")).status).toBe(400);
    const wrong = await app.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ t: token, status: "maybe" }),
    });
    expect(wrong.status).toBe(400);
    const limited = await rsvpSetup(false);
    const response = await limited.app.request(`/?t=${encodeURIComponent(limited.token)}`);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "too-many" });
  });
});
