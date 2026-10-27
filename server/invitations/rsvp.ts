/**
 * Answering an invitation without an account, with the server's key (`impersonate`, like the
 * Firmenverwaltung, server/company/calendars.ts): the event is read in the organizer's account,
 * and the attendee's answer goes into it, PARTSTAT as Stalwart would enter a REPLY. A colleague on
 * the same server also has the event in their own calendar (from the invitation mail); their copy
 * gets the answer too, so that it no longer waits there.
 */
import type { StalwartRequest } from "../company/management";
import type { RsvpClaim } from "./token";

const CALENDARS = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];
const PRINCIPALS = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:principals"];

/**
 * Stalwart 0.16.27 gives a series with a changed date that date's values (see src/jmap/calendar.ts,
 * WITHOUT_OVERRIDES); a window no override falls into gives the series' own.
 */
const WITHOUT_OVERRIDES = {
  recurrenceOverridesAfter: "9999-12-30T00:00:00Z",
  recurrenceOverridesBefore: "9999-12-31T00:00:00Z",
};

const SHOWN = [
  "uid",
  "title",
  "description",
  "start",
  "timeZone",
  "duration",
  "showWithoutTime",
  "locations",
  "virtualLocations",
  "participants",
  "organizerCalendarAddress",
  "recurrenceRule",
];

export type Answer = "accepted" | "declined" | "tentative";

type Participant = {
  name?: string;
  email?: string;
  calendarAddress?: string;
  roles?: Record<string, boolean>;
  participationStatus?: string;
};

type StoredEvent = {
  id: string;
  uid?: string;
  title?: string;
  description?: string;
  start: string;
  timeZone?: string | null;
  duration?: string;
  showWithoutTime?: boolean;
  locations?: Record<string, { name?: string }>;
  virtualLocations?: Record<string, { name?: string; uri?: string }>;
  participants?: Record<string, Participant>;
  organizerCalendarAddress?: string;
  recurrenceRule?: unknown;
};

/** What the answer page shows: the event as in the invitation, and the attendee's answer. */
export type RsvpView = {
  event: Omit<StoredEvent, "id" | "uid" | "participants">;
  organizer: { name: string | null; email: string };
  people: { name: string | null; email: string; status: string; organizer: boolean }[];
  me: { email: string; status: string };
};

export type RsvpResult =
  | { ok: true; view: RsvpView }
  | { ok: false; error: "gone" | "not-invited" };

const emailOf = (participant: Participant) =>
  (participant.calendarAddress ?? participant.email ?? "").replace(/^mailto:/i, "").toLowerCase();

const participantFor = (event: StoredEvent, email: string) =>
  Object.entries(event.participants ?? {}).find(
    ([, participant]) => emailOf(participant) === email,
  );

const viewOf = (event: StoredEvent, email: string): RsvpView => {
  const organizer = (event.organizerCalendarAddress ?? "").replace(/^mailto:/i, "").toLowerCase();
  const people = Object.values(event.participants ?? {})
    .filter((participant) => emailOf(participant) && participant.roles?.attendee !== false)
    .map((participant) => ({
      name: participant.name ?? null,
      email: emailOf(participant),
      status:
        participant.participationStatus ??
        (emailOf(participant) === organizer ? "accepted" : "needs-action"),
      organizer: emailOf(participant) === organizer,
    }))
    .sort((a, b) => Number(b.organizer) - Number(a.organizer));
  const { id: _id, uid: _uid, participants: _participants, ...shown } = event;
  return {
    event: shown,
    organizer: {
      name: people.find((person) => person.organizer)?.name ?? null,
      email: organizer,
    },
    people,
    me: { email, status: people.find((person) => person.email === email)?.status ?? "" },
  };
};

export const createRsvp = (request: StalwartRequest) => {
  const call = async <T>(method: string, args: Record<string, unknown>, using = CALENDARS) =>
    (await request([[method, args, "0"]], using))[0]![1] as T;

  /** The event the token names, if it is still there under that UID. */
  const stored = async (claim: RsvpClaim): Promise<StoredEvent | null> => {
    const { list } = await call<{ list: StoredEvent[] }>("CalendarEvent/get", {
      accountId: claim.accountId,
      ids: [claim.eventId],
      properties: SHOWN,
      ...WITHOUT_OVERRIDES,
    });
    const event = list[0];
    return event && event.uid === claim.uid ? event : null;
  };

  const setAnswer = async (
    accountId: string,
    eventId: string,
    participantId: string,
    answer: Answer,
  ) => {
    const result = await call<{
      notUpdated?: Record<string, { description?: string; type: string }>;
    }>("CalendarEvent/set", {
      accountId,
      sendSchedulingMessages: false,
      update: { [eventId]: { [`participants/${participantId}/participationStatus`]: answer } },
    });
    const failed = Object.values(result.notUpdated ?? {})[0];
    if (failed) throw new Error(failed.description ?? failed.type);
  };

  /** The colleague's own copy of the event (same UID), if the attendee is on this server. */
  const answerOwnCopy = async (claim: RsvpClaim, answer: Answer) => {
    const { ids: accounts } = await call<{ ids: string[] }>(
      "Principal/query",
      { accountId: claim.accountId, filter: { email: claim.email } },
      PRINCIPALS,
    );
    for (const accountId of accounts.filter((id) => id !== claim.accountId)) {
      const { ids } = await call<{ ids: string[] }>("CalendarEvent/query", {
        accountId,
        filter: { uid: claim.uid },
      });
      if (!ids.length) continue;
      const { list } = await call<{ list: StoredEvent[] }>("CalendarEvent/get", {
        accountId,
        ids,
        properties: ["participants"],
      });
      for (const event of list) {
        const mine = participantFor(event, claim.email);
        if (mine) await setAnswer(accountId, event.id, mine[0], answer);
      }
    }
  };

  const load = async (claim: RsvpClaim): Promise<RsvpResult> => {
    const event = await stored(claim);
    if (!event) return { ok: false, error: "gone" };
    if (!participantFor(event, claim.email)) return { ok: false, error: "not-invited" };
    return { ok: true, view: viewOf(event, claim.email) };
  };

  const answer = async (claim: RsvpClaim, value: Answer): Promise<RsvpResult> => {
    const event = await stored(claim);
    if (!event) return { ok: false, error: "gone" };
    const mine = participantFor(event, claim.email);
    if (!mine) return { ok: false, error: "not-invited" };
    await setAnswer(claim.accountId, event.id, mine[0], value);
    await answerOwnCopy(claim, value).catch((error: Error) =>
      console.warn(`Zusage im Kalender von ${claim.email}: ${error.message}`),
    );
    const answered = {
      ...event,
      participants: {
        ...event.participants,
        [mine[0]]: { ...mine[1], participationStatus: value },
      },
    };
    return { ok: true, view: viewOf(answered, claim.email) };
  };

  return { load, answer };
};

export type Rsvp = ReturnType<typeof createRsvp>;
