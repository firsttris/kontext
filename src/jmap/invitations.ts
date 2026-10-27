/**
 * Saving an event with attendees, and Kontext sending the invitations instead of Stalwart: the
 * change goes in with `sendSchedulingMessages: false`, then the stored event before and after
 * decides who hears what (invitation-plan.ts), and each attendee gets a mail from the organizer
 * in Kontext's look (invitation-mail.ts), sent like a mail from the composer and kept in Sent.
 * Only when the user may send as the organizer; otherwise (a colleague's event in a shared
 * calendar) Stalwart sends, as before. Attendees on the same server get the event into their
 * calendar from that mail: Stalwart reads the text/calendar part of every mail it delivers
 * (crates/email/src/message/ingest.rs → itip_ingest), as it does with its own.
 */
import type { AnswerLinks } from "@/lib/invitation-mail";
import { invitationMessage } from "@/lib/invitation-mail";
import { planInvitations, raisesSequence } from "@/lib/invitation-plan";
import { type Participant, participantEmail } from "@/lib/jscalendar";
import { findRole } from "@/lib/mailboxes";
import { createEvent, deleteEvent, getStoredEvent, updateEvent } from "./calendar";
import type { JmapClient } from "./client";
import { listIdentities, listMailboxes } from "./mail";
import { sendRaw } from "./send-raw";
import type { Identity } from "./types";

export type EventChange =
  | { kind: "create"; calendarId: string; event: Record<string, unknown> }
  /** `id`: the event, the series or one date of it. */
  | { kind: "update"; id: string; patch: Record<string, unknown> }
  | { kind: "destroy"; id: string };

/** The answer pages for the attendees, by address (the server signs them; may be empty). */
export type AnswerLinksOf = (
  accountId: string,
  eventId: string,
) => Promise<Record<string, AnswerLinks>>;

const bare = (address: unknown) =>
  typeof address === "string" ? address.replace(/^mailto:/i, "").toLowerCase() : "";

/** The identity that sends as the organizer, if the user has one in that account. */
const senderFor = (identities: Identity[], organizer: string) =>
  organizer ? identities.find((identity) => identity.email.toLowerCase() === organizer) : undefined;

/**
 * The organizer's participant with the sender's name, when the form left it out: the
 * invitation's ORGANIZER and the attendees' copies then name a person, not an address.
 */
const withOrganizerName = (change: EventChange, sender: Identity | undefined): EventChange => {
  const data =
    change.kind === "create" ? change.event : change.kind === "update" ? change.patch : null;
  const participants = data?.participants as Record<string, Participant> | null | undefined;
  if (!data || !participants || !sender?.name) return change;
  const named = Object.fromEntries(
    Object.entries(participants).map(([id, participant]) => [
      id,
      !participant.name && bare(participantEmail(participant)) === sender.email.toLowerCase()
        ? { ...participant, name: sender.name }
        : participant,
    ]),
  );
  return change.kind === "create"
    ? { ...change, event: { ...change.event, participants: named } }
    : ({ ...change, patch: { ...data, participants: named } } as EventChange);
};

const writeChange = async (
  client: JmapClient,
  accountId: string,
  change: EventChange,
  sendSchedulingMessages: boolean,
): Promise<string> => {
  const scheduling = { sendSchedulingMessages };
  if (change.kind === "create") {
    return createEvent(client, accountId, change.calendarId, change.event, scheduling);
  }
  if (change.kind === "update") {
    await updateEvent(client, accountId, change.id, change.patch, scheduling);
  } else {
    await deleteEvent(client, accountId, change.id, scheduling);
  }
  return change.id;
};

const organizerAfter = (
  change: EventChange,
  before: { organizerCalendarAddress?: string } | null,
) => {
  if (change.kind === "create") return bare(change.event.organizerCalendarAddress);
  if (change.kind === "update" && "organizerCalendarAddress" in change.patch) {
    return bare(change.patch.organizerCalendarAddress);
  }
  return bare(before?.organizerCalendarAddress);
};

/**
 * Writes the change and sends what it calls for; the id of the event. A failed sending throws
 * after the event is saved, so the user hears of it.
 */
export const saveEvent = async (
  client: JmapClient,
  accountId: string,
  change: EventChange,
  linksOf: AnswerLinksOf,
  now: () => Date = () => new Date(),
): Promise<string> => {
  const [identities, before] = await Promise.all([
    listIdentities(client, accountId).catch(() => [] as Identity[]),
    change.kind === "create" ? null : getStoredEvent(client, accountId, change.id),
  ]);
  const sender = senderFor(identities, organizerAfter(change, before));
  const id = await writeChange(client, accountId, withOrganizerName(change, sender), !sender);
  if (!sender) return id;

  // A deleted date leaves the series; a deleted series or single event is gone.
  const storedId = before?.id ?? id;
  const goneWhole = change.kind === "destroy" && storedId === change.id;
  let after = goneWhole ? null : await getStoredEvent(client, accountId, storedId);
  if (before && after && raisesSequence(before, after)) {
    const sequence = (before.sequence ?? 0) + 1;
    await updateEvent(client, accountId, after.id, { sequence }, { sendSchedulingMessages: false });
    after = { ...after, sequence };
  }
  const planned = planInvitations({ before, after, mine: [sender.email], now: now() });
  if (!planned.length) return id;

  const links = after ? await linksOf(accountId, after.id).catch(() => ({})) : {};
  const mailboxes = await listMailboxes(client, accountId);
  const drafts = findRole(mailboxes, "drafts");
  const sent = findRole(mailboxes, "sent");
  if (!drafts || !sent) throw new Error("Postfach ohne Entwürfe oder Gesendet");
  for (const invitation of planned) {
    const raw = invitationMessage({
      kind: invitation.kind,
      event: invitation.event,
      organizer: { name: sender.name || null, email: sender.email },
      recipient: { name: invitation.name, email: invitation.email },
      links: (links as Record<string, AnswerLinks>)[invitation.email] ?? null,
      now: now(),
      id: crypto.randomUUID(),
    });
    await sendRaw(client, {
      accountId,
      raw,
      identityId: sender.id,
      from: sender.email,
      recipients: [invitation.email],
      draftsId: drafts.id,
      sentId: sent.id,
    });
  }
  return id;
};
