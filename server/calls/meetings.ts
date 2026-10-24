/**
 * Meetings by link: a calendar event gets a link to its own room (/meet/<id>), which colleagues
 * open signed in and guests (customers without an account) with just their name. The link is the
 * key – an unguessable id, nothing stored. Guests only get in while someone of the company is
 * there, so a forwarded link never opens an empty room to strangers. Pure.
 */
import { z } from "zod";
import type { Calls } from "./calls";

/** The calls state names a meeting "meet-<id>" (channel ids are UUIDs or "team"). */
export const meetingKey = (id: string) => `meet-${id}`;

/** 128 random bits, URL-safe. */
export const newMeetingId = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export const meetingIdSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export const meetingUrl = (origin: string, id: string) => `${origin}/meet/${id}`;

const GUEST_PREFIX = "guest-";
export const isGuest = (identity: string) => identity.startsWith(GUEST_PREFIX);
export const guestIdentity = () => `${GUEST_PREFIX}${crypto.randomUUID()}`;

export const guestSchema = z.object({ name: z.string().trim().min(1).max(60) });

/** Someone of the company is in the meeting: guests may come in. */
export const hostPresent = (calls: Calls, id: string): boolean =>
  (calls[meetingKey(id)]?.participants ?? []).some((identity) => !isGuest(identity));
