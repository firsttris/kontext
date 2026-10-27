/**
 * The token in an invitation's answer links (/rsvp?t=…): which attendee of which event, until
 * when, signed with HMAC-SHA-256 under a key derived from the server secret (like the sealers in
 * crypto.ts, one purpose per key). Whoever holds it may answer for that attendee, nothing else;
 * it names the event by account, id and UID, so a new event with the same id does not fit.
 */

const encoder = new TextEncoder();

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(Buffer.from(text, "base64url"));

export type RsvpClaim = {
  /** The organizer's account, where the event is. */
  accountId: string;
  eventId: string;
  uid: string;
  /** The attendee, lower case. */
  email: string;
  expiresAt: Date;
};

type Wire = { a: string; e: string; u: string; m: string; x: number };

const isWire = (value: unknown): value is Wire => {
  const wire = value as Partial<Wire> | null;
  return (
    typeof wire?.a === "string" &&
    typeof wire.e === "string" &&
    typeof wire.u === "string" &&
    typeof wire.m === "string" &&
    typeof wire.x === "number"
  );
};

export type RsvpTokens = {
  sign: (claim: RsvpClaim) => Promise<string>;
  /** The claim, or null when the token is forged, broken or past its time. */
  verify: (token: string, now?: Date) => Promise<RsvpClaim | null>;
};

export const createRsvpTokens = async (secret: string): Promise<RsvpTokens> => {
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(`rsvp:${secret}`));
  const key = await crypto.subtle.importKey(
    "raw",
    material,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return {
    sign: async ({ accountId, eventId, uid, email, expiresAt }) => {
      const wire: Wire = {
        a: accountId,
        e: eventId,
        u: uid,
        m: email.toLowerCase(),
        x: Math.floor(expiresAt.getTime() / 1000),
      };
      const body = toBase64(encoder.encode(JSON.stringify(wire)));
      const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body)));
      return `${body}.${toBase64(mac)}`;
    },
    verify: async (token, now = new Date()) => {
      const [body, mac, extra] = token.split(".");
      if (!body || !mac || extra !== undefined) return null;
      // verify compares in constant time.
      const valid = await crypto.subtle
        .verify("HMAC", key, fromBase64(mac), encoder.encode(body))
        .catch(() => false);
      if (!valid) return null;
      let wire: unknown;
      try {
        wire = JSON.parse(new TextDecoder().decode(fromBase64(body)));
      } catch {
        return null;
      }
      if (!isWire(wire) || wire.x * 1000 <= now.getTime()) return null;
      return {
        accountId: wire.a,
        eventId: wire.e,
        uid: wire.u,
        email: wire.m,
        expiresAt: new Date(wire.x * 1000),
      };
    },
  };
};
