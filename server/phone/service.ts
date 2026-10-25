/**
 * Telephony at run time: the boxes that are connected, what their events do to the calls, and the
 * commands Kontext gives them (answer in a room, dial, hang up). Every change of a call goes out
 * on the live connection to whoever sees it; a ringing or missed call also reaches the line's
 * people with Kontext closed (Web Push).
 */
import type { Hub } from "../live/hub";
import { TRUNK_USER } from "./livekit-sip";
import { toDialable, toE164 } from "./numbers";
import {
  applyCallEvent,
  canSeeCall,
  incomingCall,
  outgoingCall,
  type PhoneCall,
  phoneNotice,
  takeCall,
} from "./phone";
import type { BoxConfig, CallEvent, FromBox, ToBox } from "./protocol";
import type { PhoneSettings, PhoneStore } from "./store";

/** How long an incoming call rings in Kontext before the box lets go of it. */
const RING_SECONDS = 60;

export type PhoneDeps = {
  store: PhoneStore;
  hub: Hub;
  /** Where the boxes reach LiveKit SIP: the server's public name and SIP port. */
  trunkHost: string;
  trunkPort: number;
  notify?: (members: string[], notice: ReturnType<typeof phoneNotice>) => Promise<void>;
  /** Re-creates LiveKit SIP's trunk when the password changes. */
  ensureSip?: (password: string) => Promise<unknown>;
  newId?: () => string;
  now?: () => Date;
};

export type Problem = "not-allowed" | "offline" | "not-found" | "busy" | "bad-number";

export const desiredConfig = (
  settings: PhoneSettings,
  trunkHost: string,
  trunkPort: number,
): BoxConfig => ({
  line: settings.line,
  trunk: {
    host: trunkHost,
    port: trunkPort,
    username: TRUNK_USER,
    password: settings.trunkPassword,
  },
  ringSeconds: RING_SECONDS,
});

export const createPhoneService = (deps: PhoneDeps) => {
  const { store, hub } = deps;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date());
  const connected = new Map<string, (message: ToBox) => void>();

  const publish = (call: PhoneCall) =>
    hub.publish({ type: "phone", call }, (viewer) => canSeeCall(call, viewer.me));

  const save = async (call: PhoneCall) => {
    await store.saveCall(call);
    publish(call);
  };

  const sendConfig = async (boxId?: string) => {
    const message: ToBox = {
      type: "config",
      version: now().getTime(),
      config: desiredConfig(await store.settings(), deps.trunkHost, deps.trunkPort),
    };
    for (const [id, send] of connected) if (!boxId || id === boxId) send(message);
  };

  const onEvent = async (boxId: string, event: CallEvent) => {
    const known = await store.callOfBox(boxId, event.call);
    if (!known) {
      // Calls appear when they ring here; dialled ones exist from the dial on.
      if (event.state !== "ringing" || event.direction !== "in") return;
      const { ring } = await store.settings();
      const call = incomingCall(event, { id: newId(), boxId, members: ring });
      await save(call);
      void deps.notify?.(call.members, phoneNotice(call)).catch(() => undefined);
      return;
    }
    const next = applyCallEvent(known, event);
    if (next === known) return;
    await save(next);
    if (next.outcome === "missed") {
      void deps.notify?.(next.members, phoneNotice(next)).catch(() => undefined);
    }
  };

  const send = (call: PhoneCall, message: ToBox): boolean => {
    const to = connected.get(call.boxId);
    to?.(message);
    return Boolean(to);
  };

  const allowed = async (me: string) => (await store.settings()).ring.includes(me);

  return {
    /** A box came online; the function it returns handles what the box says. */
    connect: (boxId: string, sendToBox: (message: ToBox) => void) => {
      connected.set(boxId, sendToBox);
      void sendConfig(boxId);
      return {
        receive: async (message: FromBox) => {
          if (message.type === "hello") await store.seen(boxId, { version: message.version });
          if (message.type === "status") {
            await store.seen(boxId, {
              status: { registered: message.registered, detail: message.detail },
            });
          }
          if (message.type === "event") {
            await onEvent(boxId, message);
            sendToBox({ type: "ack", seq: message.seq });
          }
          if (message.type === "applied") await store.seen(boxId, {});
        },
        close: () => {
          if (connected.get(boxId) === sendToBox) connected.delete(boxId);
        },
      };
    },

    online: () => [...connected.keys()],
    allowed,

    /** The settings changed: tell the boxes and LiveKit SIP. */
    reconfigure: async () => {
      const settings = await store.settings();
      await deps.ensureSip?.(settings.trunkPassword);
      await sendConfig();
    },

    callsOf: async (me: string, limit = 100): Promise<PhoneCall[]> =>
      (await store.recentCalls(limit * 3)).filter((call) => canSeeCall(call, me)).slice(0, limit),

    /** Take a ringing call in Kontext: the box puts it into a new room, which the caller joins. */
    answer: async (callId: string, me: string): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call || !canSeeCall(call, me)) return "not-found";
      const taken = takeCall(call, me, newId());
      if (!taken) return "busy";
      if (!connected.has(taken.boxId)) return "offline";
      // Saved before the box hears of it: its "answered" may come back at once and must apply
      // to the taken call, not be overwritten by it.
      await save(taken);
      send(taken, { type: "answer", call: taken.boxCallId, room: taken.room! });
      return taken;
    },

    /** Call a number from Kontext, through a box that is online. */
    dial: async (me: string, number: string): Promise<PhoneCall | Problem> => {
      if (!(await allowed(me))) return "not-allowed";
      const remote = toE164(number);
      if (!remote) return "bad-number";
      const boxId = connected.keys().next().value;
      if (!boxId) return "offline";
      const call = outgoingCall({
        id: newId(),
        boxId,
        member: me,
        remote,
        room: newId(),
        at: now().toISOString(),
      });
      await save(call);
      send(call, { type: "dial", call: call.id, room: call.room!, number: toDialable(remote) });
      return call;
    },

    hangup: async (callId: string, me: string): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call || call.member !== me) return "not-found";
      if (call.state !== "ended") send(call, { type: "hangup", call: call.boxCallId });
      return call;
    },

    /** Whoever had the call left its room (closed the tab, lost the network): end it. */
    leftRoom: async (room: string, identity: string) => {
      const call = await store.callOfRoom(room);
      if (call && call.state !== "ended" && call.member === identity) {
        send(call, { type: "hangup", call: call.boxCallId });
      }
    },

    note: async (callId: string, me: string, note: string): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call || !canSeeCall(call, me)) return "not-found";
      const next = { ...call, note };
      await save(next);
      return next;
    },
  };
};

export type PhoneService = ReturnType<typeof createPhoneService>;
