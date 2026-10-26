/**
 * Telephony at run time: the boxes that are connected, what their events do to the calls, and the
 * commands Kontext gives them (answer in a room, dial, hang up). Every change of a call goes out
 * on the live connection to whoever sees it; a ringing or missed call also reaches the line's
 * people with Kontext closed (Web Push).
 */
import type { Hub } from "../live/hub";
import { companyDay, type NewTaskData } from "../tasks/tasks";
import {
  choiceOf,
  deskCall,
  deskForBox,
  deskOf,
  everyone,
  lineOf,
  outLineOf,
  ringPlanFor,
  ringPlanForCall,
} from "./lines";
import { TRUNK_USER } from "./livekit-sip";
import { numberForms, toDialable, toE164 } from "./numbers";
import {
  answeredCallbacks,
  applyCallEvent,
  blockedCall,
  callbackTask,
  canSeeCall,
  closedCall,
  dialTarget,
  faxCall,
  incomingCall,
  isDoor,
  isPerson,
  menuMailboxCall,
  outgoingCall,
  type PhoneCall,
  type PhoneStatus,
  phoneNotice,
  type RingPlan,
  ringingFor,
  roomIsOver,
  takeCall,
  unavailableAt,
  withoutUnavailable,
} from "./phone";
import {
  type BoxConfig,
  type CallEvent,
  type FromBox,
  MAX_BLOCKED_NUMBERS,
  type ToBox,
} from "./protocol";
import type { PhoneSettings, PhoneStore } from "./store";
import { createTransfers, type TransferTarget } from "./transfer";

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

export type Problem = "not-allowed" | "offline" | "not-found" | "busy" | "bad-number" | "full";

/** How long a message on the mailbox may be. */
const MAILBOX_SECONDS = 120;

/** Only sounds that still exist; a deleted greeting leaves the beep alone. */
const knownSound = (settings: PhoneSettings, id: string | null) =>
  id && settings.sounds.some((sound) => sound.id === id) ? id : null;

/** The company's time zone; the box compares opening hours in it. */
const TIMEZONE = "Europe/Berlin";

/**
 * Closed days from today on, for the year ahead: Asterisk knows no years, so a past day would come
 * back, and one a year or more ahead would close the same date this year.
 */
const comingDays = (days: { day: string }[], today: string) => {
  const yearAhead = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;
  return days.map((entry) => entry.day).filter((day) => day >= today && day < yearAhead);
};

/** The first line's ring plan, as the app sees it. */
export const ringPlanOf = (settings: PhoneSettings): RingPlan => ringPlanFor(settings, null);

export const desiredConfig = (
  settings: PhoneSettings,
  trunkHost: string,
  trunkPort: number,
  today = companyDay(new Date()),
  unavailable: string[] = [],
): BoxConfig => {
  const { mailbox, hours } = settings;
  const greeting = knownSound(settings, mailbox.greeting);
  const closedGreeting = knownSound(settings, hours.greeting);
  const menuGreeting = settings.menu.enabled ? knownSound(settings, settings.menu.greeting) : null;
  const notice = settings.recording.enabled
    ? knownSound(settings, settings.recording.notice)
    : null;
  return {
    line: settings.line,
    extraLines: settings.line
      ? settings.extraLines.map(({ id, username, password }) => ({ id, username, password }))
      : [],
    // The desk phone of someone who does not take calls stays quiet.
    deskPhones: settings.deskPhones.map((desk) =>
      desk.member && unavailable.includes(desk.member)
        ? { ...deskForBox(settings, desk), lines: [] }
        : deskForBox(settings, desk),
    ),
    trunk: {
      host: trunkHost,
      port: trunkPort,
      username: TRUNK_USER,
      password: settings.trunkPassword,
    },
    ringSeconds: mailbox.enabled ? mailbox.ringSeconds : RING_SECONDS,
    sounds: [
      ...new Set([
        ...(mailbox.enabled && greeting ? [greeting] : []),
        ...(hours.enabled && closedGreeting ? [closedGreeting] : []),
        ...(menuGreeting ? [menuGreeting] : []),
        ...(notice ? [notice] : []),
      ]),
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
    fax: settings.fax.enabled && settings.fax.line ? { line: settings.fax.line } : null,
    recording: settings.recording.enabled ? { notice } : null,
    blocked: {
      numbers: [...new Set(settings.blocked.numbers.flatMap((entry) => numberForms(entry.number)))],
      anonymous: settings.blocked.anonymous,
    },
    // Without a greeting there is no menu to hear.
    menu:
      menuGreeting && settings.menu.options.length
        ? {
            greeting: menuGreeting,
            options: settings.menu.options.map(({ digit, mailbox: toMailbox }) => ({
              digit,
              mailbox: toMailbox,
            })),
            waitSeconds: 5,
          }
        : null,
    forward: settings.forward
      ? { number: toDialable(settings.forward.number), afterSeconds: settings.forward.afterSeconds }
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

  /**
   * Web Push to whoever hears the call now, and later to the next ones when they ring one after
   * another – as long as it still rings.
   */
  const ringPhones = (call: PhoneCall, plan: RingPlan) => {
    const notify = (members: string[]) =>
      void deps.notify?.(members, phoneNotice(call)).catch(() => undefined);
    notify(ringingFor(plan, 0));
    if (plan.mode !== "order") return;
    plan.order.forEach((_, step) => {
      if (step === 0) return;
      const seconds = step * plan.stepSeconds;
      setTimeout(async () => {
        const now = await store.call(call.id);
        if (now?.state === "ringing") notify(ringingFor(plan, seconds));
      }, seconds * 1000).unref?.();
    });
  };

  /**
   * When the next "Abwesend bis" runs out, the boxes get a new config (the desk phone rings
   * again) and everyone sees the person back. Looked at anew with every config, so a restart or a
   * long away is covered; long waits are cut into steps, as timers do not reach that far.
   */
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  const watchStatuses = async () => {
    if (statusTimer) clearTimeout(statusTimer);
    statusTimer = null;
    const ends = (await store.statuses())
      .map((status) => (status.until ? Date.parse(status.until) - now().getTime() : 0))
      .filter((left) => left > 0);
    if (!ends.length) return;
    statusTimer = setTimeout(
      () => {
        void publishPeople();
        void sendConfig();
      },
      Math.min(...ends, 6 * 3_600_000),
    );
    statusTimer.unref?.();
  };

  const sendConfig = async (boxId?: string) => {
    const message: ToBox = {
      type: "config",
      version: now().getTime(),
      config: desiredConfig(
        await store.settings(),
        deps.trunkHost,
        deps.trunkPort,
        companyDay(now()),
        unavailableAt(await store.statuses(), now()),
      ),
    };
    for (const [id, send] of connected) if (!boxId || id === boxId) send(message);
    await watchStatuses();
  };

  /**
   * One at a time per call: two people pressing "Annehmen" at once would both read it as ringing
   * before either is saved. The second one waits and then finds it taken. The box's events for a
   * known call take the same queue, so a hang-up and an answer at once do not overwrite each
   * other.
   */
  const queues = new Map<string, Promise<unknown>>();
  const oneAtATime = <T>(callId: string, work: () => Promise<T>): Promise<T> => {
    const next = (queues.get(callId) ?? Promise.resolve()).then(work, work);
    const settled = next.catch(() => undefined);
    queues.set(callId, settled);
    void settled.then(() => {
      if (queues.get(callId) === settled) queues.delete(callId);
    });
    return next;
  };

  const onEvent = async (boxId: string, event: CallEvent) => {
    const known = await store.callOfBox(boxId, event.call);
    if (!known && event.state === "closed" && event.direction === "in") {
      // Outside the opening hours: in the list, but nobody hears it ring.
      const settings = await store.settings();
      const line = lineOf(settings, event.line);
      const members = ringPlanFor(settings, line).order;
      await save({
        ...closedCall(event, { id: newId(), boxId, members }),
        line: line?.label ?? null,
      });
      return;
    }
    if (!known && event.state === "mailbox" && event.direction === "in") {
      // Chose the mailbox in the voice menu: it never rang, the message belongs to this call.
      const settings = await store.settings();
      const line = lineOf(settings, event.line);
      const choice = choiceOf(settings, event.choice);
      await save({
        ...menuMailboxCall(event, {
          id: newId(),
          boxId,
          members: ringPlanForCall(settings, line, choice).order,
        }),
        line: line?.label ?? null,
        topic: choice?.label ?? null,
      });
      return;
    }
    if (!known && event.state === "fax" && event.direction === "in") {
      // On the fax line: in the list as a fax, nobody hears it ring.
      const { ring } = await store.settings();
      await save(faxCall(event, { id: newId(), boxId, members: ring }));
      return;
    }
    if (!known && event.state === "blocked") {
      // Turned away by the block list: in the list, as it happened, without ringing.
      const { ring } = await store.settings();
      await save(blockedCall(event, { id: newId(), boxId, members: ring }));
      return;
    }
    if (!known && event.state === "ringing" && event.direction === "out" && event.desk) {
      // Dialled at a desk phone: in the list of its person (or the first line's people).
      await save(deskCall(await store.settings(), boxId, event, newId(), now()));
      return;
    }
    if (!known) {
      // Calls appear when they ring here; dialled ones exist from the dial on.
      if (event.state !== "ringing" || event.direction !== "in") return;
      const settings = await store.settings();
      const line = lineOf(settings, event.line);
      const choice = choiceOf(settings, event.choice);
      const door = isDoor(settings.door, event.remote);
      const plan = withoutUnavailable(
        door
          ? { mode: "all", stepSeconds: 15, order: settings.door.members }
          : ringPlanForCall(settings, line, choice),
        unavailableAt(await store.statuses(), now()),
      );
      const call = {
        ...incomingCall(event, { id: newId(), boxId, members: plan.order }),
        line: line?.label ?? null,
        topic: choice?.label ?? null,
        door,
      };
      await save(call);
      ringPhones(call, plan);
      return;
    }
    await oneAtATime(known.id, () => onKnownEvent(known.id, event));
  };

  /** An event for a call already in the list: read again in the queue, it may have changed. */
  const onKnownEvent = async (callId: string, event: CallEvent) => {
    const known = await store.call(callId);
    if (!known) return;
    const forwardTo = event.forwarded ? ((await store.settings()).forward?.number ?? null) : null;
    const applied = applyCallEvent(known, event, forwardTo);
    // Answered at a desk phone: whose it is, and which.
    const desk =
      event.desk && applied !== known ? deskOf(await store.settings(), event.desk) : null;
    const next = desk
      ? { ...applied, desk: desk.label, member: desk.member ?? applied.member }
      : applied;
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
    if (next.desk) await publishPeople();
  };

  const send = (call: PhoneCall, message: ToBox): boolean => {
    const to = connected.get(call.boxId);
    to?.(message);
    return Boolean(to);
  };

  /** Who is on the phone: in a phone room, or talking at a desk phone. */
  const busyPeople = async () => {
    const atDesks = (await store.recentCalls(50))
      .filter((call) => call.state === "talking" && call.desk && call.member)
      .map((call) => call.member!);
    return [...new Set([...[...presence.values()].flatMap((set) => [...set]), ...atDesks])];
  };

  /** For everyone (the chat shows it): who is on the phone, who does not take calls. */
  const publishPeople = async () => {
    const [busy, statuses] = await Promise.all([busyPeople(), store.statuses()]);
    hub.publish(
      { type: "phone-people", busy, unavailable: unavailableAt(statuses, now()) },
      () => true,
    );
  };

  /** At most one side left in a room: its lines are hung up. */
  const settle = async (room: string) => {
    const live = (await store.callsOfRoom(room)).filter((call) => call.state !== "ended");
    if (!live.length || !roomIsOver(presentIn(room), live)) return;
    for (const call of live) send(call, { type: "hangup", call: call.boxCallId });
  };

  const transfers = createTransfers({ store, save, send, newId, now });

  /** A call as the app gets it back from a request: with who is in its room. */
  const shown = async (result: Promise<PhoneCall | Problem>): Promise<PhoneCall | Problem> => {
    const call = await result;
    return typeof call === "string" ? call : withPresence(call);
  };

  /** Whoever has the call or is in its room may hold, resume and hang it up. */
  const inCall = (call: PhoneCall, me: string) =>
    call.member === me || presentIn(call.room).includes(me);

  /** Music for the line outside and out of the room, or back in. */
  const setHeld = async (callId: string, me: string, held: boolean) => {
    const call = await store.call(callId);
    if (!call || !inCall(call, me) || !call.room) return "not-found" as const;
    if (call.state !== "talking" || call.held === held) return "busy" as const;
    const message: ToBox = held
      ? { type: "hold", call: call.boxCallId }
      : { type: "resume", call: call.boxCallId, room: call.room };
    if (!send(call, message)) return "offline" as const;
    const next = { ...call, held };
    await save(next);
    return next;
  };

  const allowed = async (me: string) => everyone(await store.settings()).includes(me);

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
    answer: (callId: string, me: string): Promise<PhoneCall | Problem> =>
      oneAtATime(callId, async () => {
        const call = await store.call(callId);
        if (!call || !canSeeCall(call, me)) return "not-found";
        // Hung up meanwhile: the call is gone, not taken by someone else.
        if (call.state === "ended") return "not-found";
        const taken = takeCall(call, me, newId());
        if (!taken) return "busy";
        if (!connected.has(taken.boxId)) return "offline";
        // Saved before the box hears of it: its "answered" may come back at once and must apply
        // to the taken call, not be overwritten by it.
        await save(taken);
        send(taken, { type: "answer", call: taken.boxCallId, room: taken.room! });
        return taken;
      }),

    /** Call a number from Kontext, through a box that is online. */
    dial: async (me: string, number: string): Promise<PhoneCall | Problem> => {
      if (!(await allowed(me))) return "not-allowed";
      const settings = await store.settings();
      const target = dialTarget(
        number,
        settings.deskPhones.map((desk) => desk.extension),
      );
      if (!target) return "bad-number";
      const boxId = connected.keys().next().value;
      if (!boxId) return "offline";
      const line = outLineOf(settings, me);
      const call = {
        ...outgoingCall({
          id: newId(),
          boxId,
          member: me,
          remote: target.remote,
          room: newId(),
          at: now().toISOString(),
        }),
        line: line?.label ?? null,
      };
      await save(call);
      send(call, {
        type: "dial",
        call: call.id,
        room: call.room!,
        number: target.dial,
        ...(line ? { line: line.id } : {}),
      });
      return call;
    },

    hangup: async (callId: string, me: string): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call || !inCall(call, me)) return "not-found";
      if (call.state !== "ended") send(call, { type: "hangup", call: call.boxCallId });
      return call;
    },

    /** Someone of Kontext joined a phone room (LiveKit's webhook). */
    joinedRoom: async (room: string, identity: string) => {
      if (!isPerson(identity)) return;
      presence.set(room, new Set([...presentIn(room), identity]));
      for (const call of await store.callsOfRoom(room)) publish(call);
      await publishPeople();
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
      await publishPeople();
      await settle(room);
    },

    hold: (callId: string, me: string) => shown(setHeld(callId, me, true)),
    resume: (callId: string, me: string) => shown(setHeld(callId, me, false)),

    /** Who is on the phone and who does not take calls, as the app shows it. */
    people: async () => ({
      busy: await busyPeople(),
      unavailable: unavailableAt(await store.statuses(), now()),
    }),

    statusOf: async (me: string): Promise<PhoneStatus> =>
      (await store.statuses()).find((status) => status.memberId === me) ?? {
        memberId: me,
        mode: "available",
        until: null,
      },

    /**
     * Bitte nicht stören, Abwesend (until a time) or back: it no longer rings for them, their desk
     * phone stays quiet, and everyone sees it.
     */
    setStatus: async (status: PhoneStatus) => {
      await store.setStatus(status, now());
      await publishPeople();
      // Also sets the timer for when the away runs out (watchStatuses).
      await sendConfig();
    },

    /** Start or stop recording a call one is in (if the Firmenverwaltung allows it). */
    record: async (callId: string, me: string, on: boolean): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call || !inCall(call, me) || !call.room) return "not-found";
      if (!(await store.settings()).recording.enabled) return "not-allowed";
      if (call.state !== "talking" || call.held || (call.recording === "running") === on) {
        return "busy";
      }
      const message: ToBox = on
        ? { type: "record", call: call.boxCallId, room: call.room }
        : { type: "record-stop", call: call.boxCallId };
      if (!send(call, message)) return "offline";
      const state = on ? "running" : "stopped";
      await store.setRecording(call.id, state);
      const next = { ...call, recording: state } as PhoneCall;
      publish(next);
      return withPresence(next);
    },

    /** Open the door for whoever rang: the box picks up, sends the code and hangs up. */
    openDoor: async (callId: string, me: string): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call?.door || !canSeeCall(call, me)) return "not-found";
      if (call.state === "ended") return "busy";
      const { code } = (await store.settings()).door;
      if (!send(call, { type: "door-open", call: call.boxCallId, code })) return "offline";
      const opened = { ...call, member: me };
      await save(opened);
      return withPresence(opened);
    },

    /** Someone of the line blocks a number from the list: the box turns it away from now on. */
    block: async (me: string, number: string): Promise<"ok" | Problem> => {
      if (!(await allowed(me))) return "not-allowed";
      const e164 = toE164(number);
      if (!e164) return "bad-number";
      const settings = await store.settings();
      if (!settings.blocked.numbers.some((entry) => entry.number === e164)) {
        if (settings.blocked.numbers.length >= MAX_BLOCKED_NUMBERS) return "full";
        const entry = { number: e164, by: me, at: now().toISOString() };
        await store.saveSettings({
          ...settings,
          blocked: { ...settings.blocked, numbers: [...settings.blocked.numbers, entry] },
        });
        await sendConfig();
      }
      return "ok";
    },

    transfer: (callId: string, me: string, target: TransferTarget) =>
      shown(transfers.transfer(callId, me, target)),
    takeTransfer: (callId: string, me: string) =>
      oneAtATime(callId, () => shown(transfers.take(callId, me))),
    cancelTransfer: (callId: string, me: string) => shown(transfers.cancel(callId, me)),

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
      return withPresence(next);
    },
  };
};

export type PhoneService = ReturnType<typeof createPhoneService>;
