/**
 * Invitations Kontext sends itself (src/jmap/invitations.ts): /api/invitations signs the answer
 * links for the organizer, /api/rsvp is the attendees' side, without an account – the token is
 * the key, and tries per address are limited like signing in.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { UserJmap } from "../external/user-jmap";
import type { Sender, SessionInfo } from "../session-info";
import type { Answer, Rsvp } from "./rsvp";
import type { RsvpTokens } from "./token";

const CALENDARS = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];
const DAY = 86_400_000;
/** How long the answer links work after the event (or its last date) is over. */
const AFTER_EVENT = 60 * DAY;
/** A series without an end: a year and more, then the calendar program is the way to answer. */
const OPEN_SERIES = 400 * DAY;

const ANSWERS: Answer[] = ["accepted", "declined", "tentative"];

type EventForLinks = {
  uid?: string;
  organizerCalendarAddress?: string;
  participants?: Record<
    string,
    { calendarAddress?: string; email?: string; roles?: Record<string, boolean> }
  >;
  utcEnd?: string;
  recurrenceRule?: { until?: string; count?: number } | null;
};

const bare = (address: string | undefined) =>
  (address ?? "").replace(/^mailto:/i, "").toLowerCase();

/** Until when the links of an event work. */
export const linksExpire = (event: EventForLinks, now: Date): Date => {
  const rule = event.recurrenceRule;
  const last = rule
    ? rule.until
      ? Date.parse(`${rule.until.slice(0, 10)}T23:59:59Z`)
      : now.getTime() + OPEN_SERIES
    : event.utcEnd
      ? Date.parse(event.utcEnd)
      : now.getTime();
  return new Date(Math.max(last, now.getTime()) + AFTER_EVENT);
};

const linksSchema = z.object({ accountId: z.string().min(1), eventId: z.string().min(1) });

export type InvitationDeps = {
  tokens: RsvpTokens;
  /** Kontext's public address, where the answer page is. */
  publicUrl: string;
  infoOf: (request: Request) => Promise<SessionInfo | null>;
  sendersOf: (request: Request) => Promise<Sender[] | null>;
  jmapFor: (sessionId: string) => Promise<UserJmap | null>;
  /** Without the server's key no answer could be entered: then there are no links. */
  enabled: boolean;
  now?: () => Date;
};

export const createInvitationRoutes = ({
  tokens,
  publicUrl,
  infoOf,
  sendersOf,
  jmapFor,
  enabled,
  now = () => new Date(),
}: InvitationDeps) => {
  const app = new Hono();
  const base = publicUrl.replace(/\/+$/, "");

  /**
   * The answer links for each attendee of an event the person organizes: read with their own
   * token (they must see it) and only as an address they may send as.
   */
  app.post("/links", async (c) => {
    const info = await infoOf(c.req.raw);
    if (!info) return c.json({ error: "Nicht angemeldet" }, 401);
    const parsed = linksSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    if (!enabled) return c.json({ links: {} });
    const { accountId, eventId } = parsed.data;
    const jmap = await jmapFor(info.sessionId);
    if (!jmap) return c.json({ error: "Nicht angemeldet" }, 401);
    const [result] = await jmap.call<{ list?: EventForLinks[] }>(
      [
        [
          "CalendarEvent/get",
          {
            accountId,
            ids: [eventId],
            properties: [
              "uid",
              "organizerCalendarAddress",
              "participants",
              "utcEnd",
              "recurrenceRule",
            ],
          },
          "0",
        ],
      ],
      CALENDARS,
    );
    const event = result?.list?.[0];
    if (!event?.uid) return c.json({ error: "Termin nicht gefunden" }, 404);
    const organizer = bare(event.organizerCalendarAddress);
    const senders = (await sendersOf(c.req.raw)) ?? [];
    if (!organizer || !senders.some((sender) => sender.email === organizer)) {
      return c.json({ error: "Nur der Organisator verschickt Einladungen." }, 403);
    }
    const expiresAt = linksExpire(event, now());
    const attendees = [
      ...new Set(
        Object.values(event.participants ?? {})
          .map((participant) => bare(participant.calendarAddress ?? participant.email))
          .filter((email) => email && email !== organizer),
      ),
    ];
    const links: Record<string, Record<Answer, string>> = {};
    for (const email of attendees) {
      const token = await tokens.sign({ accountId, eventId, uid: event.uid, email, expiresAt });
      links[email] = Object.fromEntries(
        ANSWERS.map((answer) => [
          answer,
          `${base}/rsvp?t=${encodeURIComponent(token)}&r=${answer}`,
        ]),
      ) as Record<Answer, string>;
    }
    return c.json({ links });
  });

  return app;
};

const answerSchema = z.object({ t: z.string().min(1).max(2000), status: z.enum(ANSWERS) });

const ERRORS = {
  invalid: 400,
  "too-many": 429,
  gone: 404,
  "not-invited": 410,
} as const;

export type RsvpDeps = {
  tokens: RsvpTokens;
  rsvp: Rsvp;
  /** Whether one more try from this sender is allowed now (counted when it is). */
  mayTry: (key: string) => boolean;
  now?: () => Date;
};

/** The first address Caddy put in front, or the connection's own. */
const clientOf = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "direct";

/** The page's side: what the token names (GET) and the answer (POST). */
export const createRsvpRoutes = ({ tokens, rsvp, mayTry, now = () => new Date() }: RsvpDeps) => {
  const app = new Hono();
  const fail = (error: keyof typeof ERRORS) =>
    Response.json({ error }, { status: ERRORS[error], headers: { "cache-control": "no-store" } });

  const claimOf = async (request: Request, token: string | undefined) => {
    if (!mayTry(`rsvp:${clientOf(request)}`)) return "too-many" as const;
    const claim = token ? await tokens.verify(token, now()) : null;
    return claim ?? ("invalid" as const);
  };

  app.get("/", async (c) => {
    const claim = await claimOf(c.req.raw, c.req.query("t"));
    if (typeof claim === "string") return fail(claim);
    const result = await rsvp.load(claim);
    return result.ok
      ? c.json(result.view, 200, { "cache-control": "no-store" })
      : fail(result.error);
  });

  app.post("/", async (c) => {
    const parsed = answerSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail("invalid");
    const claim = await claimOf(c.req.raw, parsed.data.t);
    if (typeof claim === "string") return fail(claim);
    const result = await rsvp.answer(claim, parsed.data.status);
    return result.ok ? c.json(result.view) : fail(result.error);
  });

  return app;
};
