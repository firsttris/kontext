/**
 * Telephony in Kontext's SQLite: the boxes (paired by a code, then known by a token, both only as
 * hashes), the settings of the line (the Fritzbox login sealed at rest) and the calls.
 */
import { and, desc, eq, gt, isNotNull } from "drizzle-orm";
import { z } from "zod";
import type { Sealer } from "../crypto";
import type { Db } from "../db";
import * as schema from "../db/schema";
import type { PhoneCall, PhoneStatus } from "./phone";
import { hoursSchema, lineSchema } from "./protocol";

/** Stored settings; what later versions added comes with its default when it is missing. */
const settingsSchema = z.object({
  /** The box's login at the Fritzbox (an IP phone there). */
  line: lineSchema.nullable().default(null),
  /** Who hears an incoming call ring and sees the calls (personal account ids). */
  ring: z.array(z.string()).default([]),
  /** The password of the SIP trunk from the boxes to LiveKit SIP; made once. */
  trunkPassword: z.string().min(1),
  /** The board (an account id) a missed call leaves "Zurückrufen" on; null for none. */
  callbackBoard: z.string().nullable().default(null),
  /** Greetings recorded or uploaded in the Firmenverwaltung (files: server/phone/files.ts). */
  sounds: z.array(z.object({ id: z.string(), name: z.string(), seconds: z.number() })).default([]),
  /** Unanswered calls go to the mailbox; its messages arrive as mails in `deliverTo`. */
  mailbox: z
    .object({
      enabled: z.boolean(),
      ringSeconds: z.number().int().min(10).max(120),
      greeting: z.string().nullable(),
      deliverTo: z.object({ accountId: z.string(), email: z.string() }).nullable(),
    })
    .default({ enabled: false, ringSeconds: 25, greeting: null, deliverTo: null }),
  /** Outside these hours the phone does not ring; the caller hears the closing greeting. */
  hours: z
    .object({
      enabled: z.boolean(),
      open: hoursSchema.shape.open,
      closedDays: z.array(z.object({ day: z.string(), name: z.string() })),
      greeting: z.string().nullable(),
    })
    .default({ enabled: false, open: [], closedDays: [], greeting: null }),
  /** More numbers: further IP phones at the Fritzbox, each ringing for its own people. */
  extraLines: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        username: z.string(),
        password: z.string(),
        ring: z.array(z.string()),
      }),
    )
    .default([]),
  /** A voice menu before it rings: each key rings for its people, or goes to the mailbox. */
  menu: z
    .object({
      enabled: z.boolean(),
      greeting: z.string().nullable(),
      options: z.array(
        z.object({
          digit: z.string(),
          label: z.string(),
          members: z.array(z.string()),
          mailbox: z.boolean(),
        }),
      ),
    })
    .default({ enabled: false, greeting: null, options: [] }),
  /** Numbers the box turns away (E.164), and whether withheld numbers are turned away too. */
  blocked: z
    .object({
      numbers: z.array(z.object({ number: z.string(), by: z.string(), at: z.string() })),
      anonymous: z.boolean(),
    })
    .default({ numbers: [], anonymous: false }),
  /** Recording calls, and the notice the other side hears first. */
  recording: z
    .object({ enabled: z.boolean(), notice: z.string().nullable() })
    .default({ enabled: false, notice: null }),
  /** A fax line (the user name of one of the box's lines); faxes arrive as PDF mails. */
  fax: z
    .object({
      enabled: z.boolean(),
      line: z.string(),
      deliverTo: z.object({ accountId: z.string(), email: z.string() }).nullable(),
    })
    .default({ enabled: false, line: "", deliverTo: null }),
  /** The door intercom at the Fritzbox: how it calls (its number), its opening code, who hears it. */
  door: z
    .object({
      enabled: z.boolean(),
      number: z.string(),
      code: z.string(),
      members: z.array(z.string()),
    })
    .default({ enabled: false, number: "**11", code: "#", members: [] }),
  /** Desk phones (Snom) that sign in at the box and ring with Kontext. */
  deskPhones: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        mac: z.string(),
        extension: z.string(),
        password: z.string(),
        /** Whose phone it is: it rings for that person's lines; null: the first line's. */
        member: z.string().nullable(),
      }),
    )
    .default([]),
  /** All at once, or the people in `ring`'s order, each for stepSeconds, then all. */
  ringMode: z.enum(["all", "order"]).default("all"),
  ringStepSeconds: z.number().int().min(5).max(60).default(15),
  /** While it rings in Kontext, after a while also a mobile phone, E.164. */
  forward: z
    .object({ number: z.string(), afterSeconds: z.number().int().min(0).max(120) })
    .nullable()
    .default(null),
});
export type PhoneSettings = z.infer<typeof settingsSchema>;

export type BoxRow = {
  id: string;
  name: string;
  paired: boolean;
  version: string | null;
  status: { registered: boolean; detail: string } | null;
  lastSeenAt: string | null;
};

const SETTINGS_KEY = "phone";

export const sha256 = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** A random secret, URL-safe. */
export const randomSecret = (bytes = 32): string =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(bytes))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

/** "K7QM-4XPA": easy to read aloud and type, no 0/O or 1/I. */
export const pairingCode = (): string => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const picks = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(picks, (pick) => alphabet[pick % alphabet.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
};

type BoxDbRow = typeof schema.phoneBoxes.$inferSelect;
type CallDbRow = typeof schema.phoneCalls.$inferSelect;

const toBox = (row: BoxDbRow): BoxRow => ({
  id: row.id,
  name: row.name,
  paired: Boolean(row.tokenHash),
  version: row.version,
  status: row.status ? (JSON.parse(row.status) as BoxRow["status"]) : null,
  lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
});

const iso = (date: Date | null) => date?.toISOString() ?? null;

const toCall = (row: CallDbRow): PhoneCall => ({
  id: row.id,
  boxId: row.boxId,
  boxCallId: row.boxCallId,
  direction: row.direction as PhoneCall["direction"],
  remote: row.remote,
  local: row.local,
  state: row.state as PhoneCall["state"],
  outcome: (row.outcome as PhoneCall["outcome"]) ?? null,
  member: row.member,
  members: JSON.parse(row.members) as string[],
  room: row.room,
  startedAt: row.startedAt.toISOString(),
  answeredAt: iso(row.answeredAt),
  endedAt: iso(row.endedAt),
  note: row.note,
  callbackTaskId: row.callbackTaskId,
  voicemailSeconds: row.voicemailSeconds,
  offeredTo: row.offeredTo,
  offeredBy: row.offeredBy,
  offeredJoin: row.offeredJoin,
  held: row.held,
  present: [],
  forwardedTo: row.forwardedTo,
  line: row.line,
  desk: row.desk,
  topic: row.topic,
  door: row.door,
  fax: (row.fax as PhoneCall["fax"]) ?? null,
  recording: (row.recording as PhoneCall["recording"]) ?? null,
  recordingSeconds: row.recordingSeconds,
});

const fromCall = ({ present: _, ...call }: PhoneCall): CallDbRow => ({
  ...call,
  members: JSON.stringify(call.members),
  startedAt: new Date(call.startedAt),
  answeredAt: call.answeredAt ? new Date(call.answeredAt) : null,
  endedAt: call.endedAt ? new Date(call.endedAt) : null,
});

const PAIRING_MS = 30 * 60_000;

export const createPhoneStore = (db: Db, sealer: Sealer) => {
  const settings = async (): Promise<PhoneSettings> => {
    const [row] = await db
      .select()
      .from(schema.companySetting)
      .where(eq(schema.companySetting.key, SETTINGS_KEY));
    if (row) return settingsSchema.parse(JSON.parse(await sealer.open(row.value)));
    const fresh = settingsSchema.parse({ trunkPassword: randomSecret() });
    await saveSettings(fresh);
    return fresh;
  };
  const saveSettings = async (value: PhoneSettings) => {
    const row = {
      key: SETTINGS_KEY,
      value: await sealer.seal(JSON.stringify(value)),
      updatedAt: new Date(),
    };
    await db
      .insert(schema.companySetting)
      .values(row)
      .onConflictDoUpdate({ target: schema.companySetting.key, set: row });
  };

  const boxes = async () =>
    (await db.select().from(schema.phoneBoxes).orderBy(schema.phoneBoxes.createdAt)).map(toBox);

  return {
    settings,
    saveSettings,
    boxes,

    /** A new box, or a fresh code for an unpaired one; the code is shown once. */
    startPairing: async (
      name: string,
      now = new Date(),
    ): Promise<{ box: BoxRow; code: string }> => {
      const code = pairingCode();
      const row = {
        id: crypto.randomUUID(),
        name,
        tokenHash: null,
        pairingHash: await sha256(code),
        pairingExpiresAt: new Date(now.getTime() + PAIRING_MS),
        version: null,
        status: null,
        lastSeenAt: null,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.phoneBoxes).values(row);
      return { box: toBox(row), code };
    },

    /** A valid code gives the box its token (once); null for wrong or expired codes. */
    pair: async (
      code: string,
      now = new Date(),
    ): Promise<{ boxId: string; token: string } | null> => {
      const [row] = await db
        .select()
        .from(schema.phoneBoxes)
        .where(
          and(
            eq(schema.phoneBoxes.pairingHash, await sha256(code.trim().toUpperCase())),
            gt(schema.phoneBoxes.pairingExpiresAt, now),
          ),
        );
      if (!row) return null;
      const token = randomSecret();
      await db
        .update(schema.phoneBoxes)
        .set({
          tokenHash: await sha256(token),
          pairingHash: null,
          pairingExpiresAt: null,
          updatedAt: now,
        })
        .where(eq(schema.phoneBoxes.id, row.id));
      return { boxId: row.id, token };
    },

    boxOfToken: async (token: string): Promise<BoxRow | null> => {
      const [row] = await db
        .select()
        .from(schema.phoneBoxes)
        .where(eq(schema.phoneBoxes.tokenHash, await sha256(token)));
      return row ? toBox(row) : null;
    },

    seen: async (
      boxId: string,
      patch: { version?: string; status?: BoxRow["status"] },
      now = new Date(),
    ) => {
      await db
        .update(schema.phoneBoxes)
        .set({
          ...(patch.version !== undefined ? { version: patch.version } : {}),
          ...(patch.status !== undefined ? { status: JSON.stringify(patch.status) } : {}),
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(schema.phoneBoxes.id, boxId));
    },

    removeBox: async (boxId: string) => {
      await db.delete(schema.phoneBoxes).where(eq(schema.phoneBoxes.id, boxId));
    },

    call: async (id: string): Promise<PhoneCall | null> => {
      const [row] = await db.select().from(schema.phoneCalls).where(eq(schema.phoneCalls.id, id));
      return row ? toCall(row) : null;
    },

    callOfBox: async (boxId: string, boxCallId: string): Promise<PhoneCall | null> => {
      const [row] = await db
        .select()
        .from(schema.phoneCalls)
        .where(and(eq(schema.phoneCalls.boxId, boxId), eq(schema.phoneCalls.boxCallId, boxCallId)))
        .orderBy(desc(schema.phoneCalls.startedAt))
        .limit(1);
      return row ? toCall(row) : null;
    },

    /** The calls of a room: the caller's, and the lines dialled into it to hand it on. */
    callsOfRoom: async (room: string): Promise<PhoneCall[]> =>
      (await db.select().from(schema.phoneCalls).where(eq(schema.phoneCalls.room, room))).map(
        toCall,
      ),

    saveCall: async (call: PhoneCall) => {
      const row = fromCall(call);
      // A message or a fax arrives on its own way (setVoicemail, setFax); a call event must not
      // undo it.
      const {
        voicemailSeconds: _,
        fax: __,
        recording: ___,
        recordingSeconds: ____,
        ...update
      } = row;
      await db
        .insert(schema.phoneCalls)
        .values(row)
        .onConflictDoUpdate({ target: schema.phoneCalls.id, set: update });
    },

    /** The fax line's call: the box sent the fax (it arrives on its own way, like a message). */
    setFax: async (callId: string, fax: "receiving" | "received") => {
      await db.update(schema.phoneCalls).set({ fax }).where(eq(schema.phoneCalls.id, callId));
    },

    /** Recording started or stopped, or the recording arrived (with its length). */
    setRecording: async (
      callId: string,
      recording: "running" | "stopped",
      seconds: number | null = null,
    ) => {
      await db
        .update(schema.phoneCalls)
        .set({ recording, ...(seconds !== null ? { recordingSeconds: seconds } : {}) })
        .where(eq(schema.phoneCalls.id, callId));
    },

    setVoicemail: async (callId: string, seconds: number) => {
      await db
        .update(schema.phoneCalls)
        .set({ voicemailSeconds: seconds })
        .where(eq(schema.phoneCalls.id, callId));
    },

    /** Earlier calls with this number that still have an open "Zurückrufen". */
    callbacksOf: async (remote: string): Promise<PhoneCall[]> =>
      (
        await db
          .select()
          .from(schema.phoneCalls)
          .where(
            and(eq(schema.phoneCalls.remote, remote), isNotNull(schema.phoneCalls.callbackTaskId)),
          )
      ).map(toCall),

    /** Who does not take calls now, or only until a time (Bitte nicht stören, Abwesend). */
    statuses: async (): Promise<PhoneStatus[]> =>
      (await db.select().from(schema.phoneStatus)).map((row) => ({
        memberId: row.memberId,
        mode: row.mode as PhoneStatus["mode"],
        until: row.until?.toISOString() ?? null,
      })),

    setStatus: async (status: PhoneStatus, now = new Date()) => {
      if (status.mode === "available") {
        await db.delete(schema.phoneStatus).where(eq(schema.phoneStatus.memberId, status.memberId));
        return;
      }
      const row = {
        memberId: status.memberId,
        mode: status.mode,
        until: status.until ? new Date(status.until) : null,
        updatedAt: now,
      };
      await db
        .insert(schema.phoneStatus)
        .values(row)
        .onConflictDoUpdate({ target: schema.phoneStatus.memberId, set: row });
    },

    /** All calls since a moment, for the statistics. */
    callsSince: async (since: Date): Promise<PhoneCall[]> =>
      (
        await db
          .select()
          .from(schema.phoneCalls)
          .where(gt(schema.phoneCalls.startedAt, since))
          .orderBy(desc(schema.phoneCalls.startedAt))
      ).map(toCall),

    /** The latest calls; who may see which is decided by the caller. */
    recentCalls: async (limit: number): Promise<PhoneCall[]> =>
      (
        await db
          .select()
          .from(schema.phoneCalls)
          .orderBy(desc(schema.phoneCalls.startedAt))
          .limit(limit)
      ).map(toCall),
  };
};

export type PhoneStore = ReturnType<typeof createPhoneStore>;
