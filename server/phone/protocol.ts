/**
 * What Kontext and a telephone box say to each other over the box's WebSocket (/api/phone/box).
 * The box connects out to Kontext (no port open at the customer); Kontext sends the whole desired
 * configuration and commands, the box reports its state and the calls. Shared by the server and
 * the box agent (box/agent). Pure.
 */
import { z } from "zod";

/** The box's line to the outside: as an IP phone of the Fritzbox, with its credentials. */
export const lineSchema = z.object({
  /** The Fritzbox (or another registrar) in the customer's network, e.g. "fritz.box". */
  registrar: z.string().min(1).max(200),
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});
export type Line = z.infer<typeof lineSchema>;

/** Where the box sends calls into Kontext: LiveKit SIP on the server, with the trunk's login. */
export const trunkSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive(),
  username: z.string().min(1),
  password: z.string().min(1),
});
export type Trunk = z.infer<typeof trunkSchema>;

/** Everything the box needs, whole and versioned: it always renders from all of it. */
export const boxConfigSchema = z.object({
  line: lineSchema.nullable(),
  trunk: trunkSchema.nullable(),
  /** How long an incoming call may ring in Kontext before the box gives up. */
  ringSeconds: z.number().int().min(10).max(300),
});
export type BoxConfig = z.infer<typeof boxConfigSchema>;

const callId = z.string().min(1).max(100);

/** Kontext → box. */
export const toBoxSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("config"), version: z.number().int(), config: boxConfigSchema }),
  /** Someone answered in Kontext: put the ringing call into this LiveKit room. */
  z.object({ type: z.literal("answer"), call: callId, room: z.string().uuid() }),
  /** Call a number from this room ("call" is Kontext's id; events about it carry it). */
  z.object({
    type: z.literal("dial"),
    call: callId,
    room: z.string().uuid(),
    number: z.string().regex(/^[0-9+*#]{2,32}$/),
  }),
  z.object({ type: z.literal("hangup"), call: callId }),
  /** Events up to this number arrived; the box need not send them again. */
  z.object({ type: z.literal("ack"), seq: z.number().int() }),
]);
export type ToBox = z.infer<typeof toBoxSchema>;

export const CALL_STATES = ["ringing", "answered", "ended"] as const;

/** One step of a call, as the box saw it. */
export const callEventSchema = z.object({
  type: z.literal("event"),
  /** Counts up per box; after a reconnect the box sends what Kontext did not ack. */
  seq: z.number().int().nonnegative(),
  call: callId,
  state: z.enum(CALL_STATES),
  direction: z.enum(["in", "out"]),
  /** The other side's number, as the line delivered it; empty for withheld numbers. */
  remote: z.string().max(64).default(""),
  /** The own number that was called (incoming). */
  local: z.string().max(64).default(""),
  /** Asterisk's hangup cause (Q.850): 16 normal, 17 busy, 19 no answer, 26 answered elsewhere. */
  cause: z.number().int().optional(),
  at: z.string().datetime(),
});
export type CallEvent = z.infer<typeof callEventSchema>;

/** Box → Kontext. */
export const fromBoxSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), version: z.string().max(40) }),
  z.object({
    type: z.literal("status"),
    /** Signed in at the Fritzbox (or the line's registrar). */
    registered: z.boolean(),
    detail: z.string().max(300).default(""),
  }),
  callEventSchema,
  z.object({
    type: z.literal("applied"),
    version: z.number().int(),
    error: z.string().max(500).optional(),
  }),
]);
export type FromBox = z.infer<typeof fromBoxSchema>;

/** Reads one WebSocket message; null for anything that is not a known message. */
export const parseMessage = <T>(schema: z.ZodType<T>, raw: string): T | null => {
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};
