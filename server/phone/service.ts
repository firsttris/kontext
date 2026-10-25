/**
 * Telephony at run time: the boxes that are connected, what their events do to the calls, and the
 * commands Kontext gives them (answer in a room, dial, hang up). Every change of a call goes out
 * on the live connection to whoever sees it; a ringing or missed call also reaches the line's
 * people with Kontext closed (Web Push).
 */
import type { Hub } from "../live/hub";
import { companyDay, type NewTaskData } from "../tasks/tasks";
import { TRUNK_USER } from "./livekit-sip";
import { toDialable, toE164 } from "./numbers";
import {
  answeredCallbacks,
  applyCallEvent,
  callbackTask,
  canSeeCall,
  closedCall,
  incomingCall,
  isPerson,
  outgoingCall,
  type PhoneCall,
  phoneNotice,
  roomIsOver,
  takeCall,
} from "./phone";
import type { BoxConfig, CallEvent, FromBox, ToBox } from "./protocol";
import type { PhoneSettings, PhoneStore } from "./store";
import { createTransfers } from "./transfer";

/** What telephony needs from the tasks: make "Zurückrufen" and tick it off. */
export type CallbackTasks = {
  create: (task: NewTaskData) => Promise<{ id: string }>;
  complete: (id: string) => Promise<void>;
};

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
  /** Missed calls become tasks on the chosen board (Firmenverwaltung). */
  tasks?: CallbackTasks;
  newId?: () => string;
  now?: () => Date;
};

export type Problem = "not-allowed" | "offline" | "not-found" | "busy" | "bad-number";

/** How long a message on the mailbox may be. */
const MAILBOX_SECONDS = 120;

/** Only sounds that still exist; a deleted greeting leaves the beep alone. */
const knownSound = (settings: PhoneSettings, id: string | null) =>
  id && settings.sounds.some((sound) => sound.id === id) ? id : null;

/** The company's time zone; the box compares opening hours in it. */
const TIMEZONE = "Europe/Berlin";

/** Closed days from today on (Asterisk knows no years, so past ones would come back). */
const comingDays = (days: { day: string }[], today: string) =>
  days.map((entry) => entry.day).filter((day) => day >= today);

export const desiredConfig = (
  settings: PhoneSettings,
  trunkHost: string,
  trunkPort: number,
  today = companyDay(new Date()),
): BoxConfig => {
  const { mailbox, hours } = settings;
  const greeting = knownSound(settings, mailbox.greeting);
  const closedGreeting = knownSound(settings, hours.greeting);
  return {
    line: settings.line,
    trunk: {
      host: trunkHost,
      port: trunkPort,
      username: TRUNK_USER,
      password: settings.trunkPassword,
    },
    ringSeconds: mailbox.enabled ? mailbox.ringSeconds : RING_SECONDS,
    sounds: [
      ...(mailbox.enabled && greeting ? [greeting] : []),
      ...(hours.enabled && closedGreeting && closedGreeting !== greeting ? [closedGreeting] : []),
    ],
    mailbox: mailbox.enabled ? { greeting, maxSeconds: MAILBOX_SECONDS } : null,
    hours: hours.enabled
      ? {
          timezone: TIMEZONE,
          open: hours.open,
          closedDays: comingDays(hours.closedDays, today).slice(0, 60),
          greeting: closedGreeting,
        }
      : null,
  };
};

export const createPhoneService = (deps: PhoneDeps) => {
  const { store, hub } = deps;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const now = deps.now ?? (() => new Date());
  const connected = new Map<string, (message: ToBox) => void>();
  /** Who of Kontext is in which phone room, from LiveKit's webhooks. */
  const presence = new Map<string, Set<string>>();
  const presentIn = (room: string | null) => (room ? [...(presence.get(room) ?? [])] : []);
  const withPresence = (call: PhoneCall): PhoneCall => ({ ...call, present: presentIn(call.room) });

  const publish = (call: PhoneCall) => {
    const shown = withPresence(call);
    hub.publish({ type: "phone", call: shown }, (viewer) => canSeeCall(shown, viewer.me));
  };

  const save = async (call: PhoneCall) => {
    await store.saveCall(call);
    publish(call);
  };

  /** A missed call leaves "Zurückrufen" on the chosen board. */
  const leaveCallback = async (call: PhoneCall) => {
    const { callbackBoard } = await store.settings();
    const task = callbackBoard && deps.tasks && callbackTask(call, callbackBoard, now());
    if (!task || !deps.tasks) return;
    const { id } = await deps.tasks.create(task);
    await save({ ...call, callbackTaskId: id });
  };

  /** Someone talked to the number: earlier "Zurückrufen" for it are done. */
  const closeCallbacks = async (talked: PhoneCall) => {
    if (!deps.tasks) return;
    for (const call of answeredCallbacks(await store.callbacksOf(talked.remote), talked)) {
      await deps.tasks.complete(call.callbackTaskId!);
      await save({ ...call, callbackTaskId: null });
    }
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
    if (!known && event.state === "closed" && event.direction === "in") {
      // Outside the opening hours: in the list, but nobody hears it ring.
      const { ring } = await store.settings();
      await save(closedCall(event, { id: newId(), boxId, members: ring }));
      return;
    }
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
    if (next.state === "ended" && known.state !== "ended") {
      await leaveCallback(next).catch(() => undefined);
    }
    if (next.state === "talking" && known.state !== "talking") {
      await closeCallbacks(next).catch(() => undefined);
    }
    // A line of a room ended (the caller hung up): is anyone left to talk to?
    if (next.state === "ended" && next.room) await settle(next.room);
  };

  const send = (call: PhoneCall, message: ToBox): boolean => {
    const to = connected.get(call.boxId);
    to?.(message);
    return Boolean(to);
  };

  /** At most one side left in a room: its lines are hung up. */
  const settle = async (room: string) => {
    const live = (await store.callsOfRoom(room)).filter((call) => call.state !== "ended");
    if (!live.length || !roomIsOver(presentIn(room), live)) return;
    for (const call of live) send(call, { type: "hangup", call: call.boxCallId });
  };

  const transfers = createTransfers({ store, save, send, newId, now });

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
      (await store.recentCalls(limit * 3))
        .filter((call) => canSeeCall(call, me))
        .slice(0, limit)
        .map(withPresence),

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

    /** Someone of Kontext joined a phone room (LiveKit's webhook). */
    joinedRoom: async (room: string, identity: string) => {
      if (!isPerson(identity)) return;
      presence.set(room, new Set([...presentIn(room), identity]));
      for (const call of await store.callsOfRoom(room)) publish(call);
    },

    /**
     * Someone left a phone room (hung up, handed over, closed the tab): with at most one side
     * left, the room's lines end.
     */
    leftRoom: async (room: string, identity: string) => {
      if (!isPerson(identity)) return;
      const left = presentIn(room).filter((other) => other !== identity);
      if (left.length) presence.set(room, new Set(left));
      else presence.delete(room);
      for (const call of await store.callsOfRoom(room)) publish(call);
      await settle(room);
    },

    transfer: transfers.transfer,
    takeTransfer: transfers.take,
    cancelTransfer: transfers.cancel,

    /** The call changed outside the service (a message arrived): tell who sees it. */
    refresh: async (callId: string) => {
      const call = await store.call(callId);
      if (call) publish(call);
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
