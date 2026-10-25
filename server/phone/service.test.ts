// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createHub, type LiveEvent } from "../live/hub";
import type { NewTaskData } from "../tasks/tasks";
import type { PhoneCall } from "./phone";
import type { CallEvent, ToBox } from "./protocol";
import { createPhoneService, desiredConfig } from "./service";
import type { PhoneSettings, PhoneStore } from "./store";

/** The store in memory, enough for the service. */
const memoryStore = (settings: PhoneSettings) => {
  const calls = new Map<string, PhoneCall>();
  let current = settings;
  const store = {
    settings: async () => current,
    saveSettings: async (next: PhoneSettings) => {
      current = next;
    },
    seen: async () => undefined,
    call: async (id: string) => calls.get(id) ?? null,
    callOfBox: async (boxId: string, boxCallId: string) =>
      [...calls.values()].find((c) => c.boxId === boxId && c.boxCallId === boxCallId) ?? null,
    callsOfRoom: async (room: string) => [...calls.values()].filter((c) => c.room === room),
    saveCall: async (call: PhoneCall) => void calls.set(call.id, call),
    callbacksOf: async (remote: string) =>
      [...calls.values()].filter((c) => c.remote === remote && c.callbackTaskId),
    recentCalls: async () => [...calls.values()].reverse(),
  };
  return store as unknown as PhoneStore;
};

const SETTINGS: PhoneSettings = {
  line: { registrar: "fritz.box", username: "kontext", password: "geheim" },
  ring: ["jonas", "anna"],
  trunkPassword: "trunk-secret",
  callbackBoard: null,
  sounds: [],
  mailbox: { enabled: false, ringSeconds: 25, greeting: null, deliverTo: null },
  hours: { enabled: false, open: [], closedDays: [], greeting: null },
  ringMode: "all",
  ringStepSeconds: 15,
  forward: null,
  extraLines: [],
};

const setup = (settings: Partial<PhoneSettings> = {}) => {
  const hub = createHub();
  const heard: { who: string; event: LiveEvent }[] = [];
  for (const me of ["jonas", "anna", "max"]) {
    hub.subscribe({ me, accountIds: [me] }, (event) => heard.push({ who: me, event }));
  }
  const notices: { members: string[]; title: string }[] = [];
  let ids = 0;
  const tasks = { made: [] as NewTaskData[], done: [] as string[] };
  const service = createPhoneService({
    store: memoryStore({ ...SETTINGS, ...settings }),
    hub,
    trunkHost: "kontext.firma.de",
    trunkPort: 5060,
    notify: async (members, notice) => void notices.push({ members, title: notice.title }),
    tasks: {
      create: async (task) => {
        tasks.made.push(task);
        return { id: `task-${tasks.made.length}` };
      },
      complete: async (id) => void tasks.done.push(id),
    },
    newId: () => `id-${++ids}`,
    now: () => new Date("2026-10-25T09:00:00.000Z"),
  });
  const toBox: ToBox[] = [];
  const box = service.connect("box-1", (message) => toBox.push(message));
  const phoneEvents = () =>
    heard.filter(({ event }) => event.type === "phone") as {
      who: string;
      event: { call: PhoneCall };
    }[];
  return { service, box, toBox, heard, notices, phoneEvents, tasks };
};

const event = (
  seq: number,
  state: CallEvent["state"],
  extra: Partial<CallEvent> = {},
): CallEvent => ({
  type: "event",
  seq,
  call: "1729850000.12",
  state,
  direction: "in",
  remote: "07223 123456",
  local: "07223 99999",
  at: "2026-10-25T09:00:00.000Z",
  ...extra,
});

describe("the box's connection", () => {
  it("gets its whole configuration on connecting", async () => {
    const { toBox } = setup();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(toBox[0]).toEqual({
      type: "config",
      version: Date.parse("2026-10-25T09:00:00.000Z"),
      config: desiredConfig(SETTINGS, "kontext.firma.de", 5060),
    });
    expect(desiredConfig(SETTINGS, "h", 5060)).toMatchObject({ ringSeconds: 60, mailbox: null });
    expect(
      desiredConfig(
        { ...SETTINGS, forward: { number: "+491712345678", afterSeconds: 15 } },
        "h",
        5060,
      ).forward,
    ).toEqual({ number: "01712345678", afterSeconds: 15 });
    const greeting = "a1b2c3d4e5f6a1b2c3d4e5f6";
    const withMailbox = {
      ...SETTINGS,
      sounds: [{ id: greeting, name: "Ansage", seconds: 8 }],
      mailbox: { enabled: true, ringSeconds: 20, greeting, deliverTo: null },
    };
    expect(desiredConfig(withMailbox, "h", 5060)).toMatchObject({
      ringSeconds: 20,
      sounds: [greeting],
      mailbox: { greeting, maxSeconds: 120 },
    });
    // A greeting that was deleted is not played.
    expect(desiredConfig({ ...withMailbox, sounds: [] }, "h", 5060)).toMatchObject({
      sounds: [],
      mailbox: { greeting: null },
    });
    const hours = {
      ...SETTINGS,
      hours: {
        enabled: true,
        open: [{ day: 1, from: "08:00", to: "17:00" }],
        closedDays: [
          { day: "2026-10-03", name: "Tag der Deutschen Einheit" },
          { day: "2026-12-24", name: "" },
        ],
        greeting: null,
      },
    };
    expect(desiredConfig(hours, "h", 5060, "2026-10-25").hours).toEqual({
      timezone: "Europe/Berlin",
      open: [{ day: 1, from: "08:00", to: "17:00" }],
      closedDays: ["2026-12-24"],
      greeting: null,
    });
    expect(desiredConfig(SETTINGS, "h", 5060).trunk).toEqual({
      host: "h",
      port: 5060,
      username: "kontext-box",
      password: "trunk-secret",
    });
  });
});

describe("an incoming call", () => {
  it("rings for the line's people, is acknowledged, and is taken by one", async () => {
    const { service, box, toBox, notices, phoneEvents } = setup();
    await box.receive(event(1, "ringing"));
    expect(toBox).toContainEqual({ type: "ack", seq: 1 });
    expect(notices).toEqual([{ members: ["jonas", "anna"], title: "Anruf" }]);
    expect(
      phoneEvents()
        .map(({ who }) => who)
        .sort(),
    ).toEqual(["anna", "jonas"]);
    expect(phoneEvents()[0]?.event.call).toMatchObject({
      id: "id-1",
      remote: "+497223123456",
      state: "ringing",
    });

    expect(await service.answer("id-1", "max")).toBe("not-found");
    const taken = await service.answer("id-1", "anna");
    expect(taken).toMatchObject({ member: "anna", room: "id-2" });
    expect(toBox).toContainEqual({ type: "answer", call: "1729850000.12", room: "id-2" });
    expect(await service.answer("id-1", "jonas")).toBe("busy");

    await box.receive(event(2, "answered"));
    await box.receive(event(3, "ended", { cause: 16 }));
    const last = phoneEvents().at(-1)!.event.call;
    expect(last).toMatchObject({ state: "ended", outcome: "answered", member: "anna" });
    expect(notices).toHaveLength(1);
  });

  it("keeps the box's answer when it comes back before the request is done", async () => {
    const { service, box, toBox, phoneEvents } = setup();
    await box.receive(event(1, "ringing"));
    // A box that answers at once, as the fake box and a quick Asterisk do.
    const replies: Promise<void>[] = [];
    const quick = service.connect("box-1", (message) => {
      toBox.push(message);
      if (message.type === "answer") replies.push(quick.receive(event(2, "answered")));
    });
    await service.answer("id-1", "anna");
    await Promise.all(replies);
    expect(phoneEvents().at(-1)!.event.call).toMatchObject({ state: "talking", member: "anna" });
  });

  it("tells the line's people of a missed call, and nothing twice for a repeat", async () => {
    const { box, notices, phoneEvents } = setup();
    await box.receive(event(1, "ringing"));
    await box.receive(event(2, "ended", { cause: 16 }));
    await box.receive(event(2, "ended", { cause: 16 }));
    expect(notices.map((n) => n.title)).toEqual(["Anruf", "Verpasster Anruf"]);
    expect(phoneEvents().filter(({ who }) => who === "jonas")).toHaveLength(2);
  });

  it("rings for the first in order, and files a call taken at the mobile phone", async () => {
    const { box, notices, phoneEvents } = setup({
      ringMode: "order",
      forward: { number: "+491712345678", afterSeconds: 10 },
    });
    await box.receive(event(1, "ringing"));
    expect(notices).toEqual([{ members: ["jonas"], title: "Anruf" }]);
    await box.receive(event(2, "answered", { forwarded: true }));
    expect(phoneEvents().at(-1)!.event.call).toMatchObject({
      state: "talking",
      forwardedTo: "+491712345678",
    });
  });

  it("rings a direct number only for its people, and they call out with it", async () => {
    const anna = {
      id: "anna",
      label: "Durchwahl Anna",
      username: "k621",
      password: "p",
      ring: ["anna"],
    };
    const { box, service, toBox, notices, phoneEvents } = setup({ extraLines: [anna] });
    await box.receive({ ...event(1, "ringing"), line: "k621" });
    expect(notices).toEqual([{ members: ["anna"], title: "Anruf" }]);
    expect(phoneEvents().at(-1)!.event.call).toMatchObject({
      members: ["anna"],
      line: "Durchwahl Anna",
    });
    expect(phoneEvents().map(({ who }) => who)).toEqual(["anna"]);
    expect(await service.allowed("anna")).toBe(true);
    const call = (await service.dial("anna", "07223 123456")) as PhoneCall;
    expect(call.line).toBe("Durchwahl Anna");
    expect(toBox.at(-1)).toMatchObject({ type: "dial", line: "anna" });
    await service.dial("jonas", "07223 123456");
    expect(toBox.at(-1)).not.toHaveProperty("line");
  });

  it("leaves Zurückrufen on the chosen board, done once someone talked to the number", async () => {
    const off = setup();
    await off.box.receive(event(1, "ringing"));
    await off.box.receive(event(2, "ended", { cause: 16 }));
    expect(off.tasks.made).toEqual([]);

    const { service, box, tasks, phoneEvents } = setup({ callbackBoard: "info" });
    await box.receive(event(1, "ringing"));
    await box.receive(event(2, "ended", { cause: 16 }));
    expect(tasks.made).toHaveLength(1);
    expect(tasks.made[0]).toMatchObject({
      accountId: "info",
      title: "Zurückrufen: 07223 123456",
      dueDate: "2026-10-25",
      links: [{ kind: "call", ref: "id-1", label: "07223 123456" }],
    });
    expect(phoneEvents().at(-1)!.event.call.callbackTaskId).toBe("task-1");

    const back = (await service.dial("jonas", "07223 123456")) as PhoneCall;
    await box.receive({ ...event(3, "answered"), call: back.boxCallId, direction: "out" });
    expect(tasks.done).toEqual(["task-1"]);
    expect(
      phoneEvents().find(({ event: e }) => e.call.id === "id-1" && !e.call.callbackTaskId),
    ).toBeDefined();
  });

  it("files a call outside the hours without ringing, with Zurückrufen", async () => {
    const { box, notices, phoneEvents, tasks } = setup({ callbackBoard: "info" });
    await box.receive(event(1, "closed"));
    expect(notices).toEqual([]);
    expect(phoneEvents().at(-1)!.event.call).toMatchObject({ state: "mailbox", outcome: "closed" });
    await box.receive(event(2, "ended", { cause: 16 }));
    expect(phoneEvents().at(-1)!.event.call).toMatchObject({ state: "ended", outcome: "closed" });
    expect(tasks.made[0]?.links[0]?.detail).toMatch(/^Außerhalb der Öffnungszeiten · /);
  });

  it("files a call taken at a desk phone", async () => {
    const { box, phoneEvents } = setup();
    await box.receive(event(1, "ringing"));
    await box.receive(event(2, "ended", { cause: 26 }));
    expect(phoneEvents().at(-1)!.event.call.outcome).toBe("elsewhere");
  });

  it("ignores events of calls it never saw ring", async () => {
    const { box, phoneEvents } = setup();
    await box.receive(event(1, "ended"));
    expect(phoneEvents()).toEqual([]);
  });
});

describe("handing a call on", () => {
  /** Jonas talks with the caller in the room. */
  const talking = async () => {
    const context = setup();
    await context.box.receive(event(1, "ringing"));
    const taken = (await context.service.answer("id-1", "jonas")) as PhoneCall;
    await context.box.receive(event(2, "answered"));
    await context.service.joinedRoom(taken.room!, "jonas");
    return { ...context, room: taken.room! };
  };

  it("to a colleague: it rings for her, she takes it, and Jonas may leave", async () => {
    const { service, toBox, room, phoneEvents } = await talking();
    expect(await service.transfer("id-1", "anna", { to: "anna" })).toBe("not-found");
    expect(await service.transfer("id-1", "jonas", { to: "max" })).toBe("not-allowed");
    const offered = await service.transfer("id-1", "jonas", { to: "anna" });
    expect(offered).toMatchObject({ offeredTo: "anna", offeredBy: "jonas", member: "jonas" });
    expect(await service.takeTransfer("id-1", "max")).toBe("not-found");
    expect(await service.takeTransfer("id-1", "anna")).toMatchObject({
      member: "anna",
      offeredTo: null,
    });
    await service.joinedRoom(room, "anna");
    expect(phoneEvents().at(-1)!.event.call.present).toEqual(["jonas", "anna"]);
    await service.leftRoom(room, "jonas");
    expect(toBox.some((m) => m.type === "hangup")).toBe(false);
    await service.leftRoom(room, "anna");
    expect(toBox).toContainEqual({ type: "hangup", call: "1729850000.12" });
  });

  it("holds the caller with music and brings them back into the room", async () => {
    const { service, toBox, room } = await talking();
    expect(await service.hold("id-1", "max")).toBe("not-found");
    expect(await service.hold("id-1", "jonas")).toMatchObject({ held: true });
    expect(toBox.at(-1)).toEqual({ type: "hold", call: "1729850000.12" });
    expect(await service.hold("id-1", "jonas")).toBe("busy");
    // Held, the caller is out of the room but still a side: Jonas alone does not end it.
    expect(toBox.some((m) => m.type === "hangup")).toBe(false);
    expect(await service.resume("id-1", "jonas")).toMatchObject({ held: false });
    expect(toBox.at(-1)).toEqual({ type: "resume", call: "1729850000.12", room });
  });

  it("asks a colleague to join (Rückfrage, three-way): the call stays Jonas's", async () => {
    const { service, toBox, room } = await talking();
    await service.hold("id-1", "jonas");
    expect(await service.transfer("id-1", "jonas", { to: "anna", join: true })).toMatchObject({
      offeredTo: "anna",
      offeredJoin: true,
    });
    expect(await service.takeTransfer("id-1", "anna")).toMatchObject({
      member: "jonas",
      offeredJoin: false,
    });
    await service.joinedRoom(room, "anna");
    await service.resume("id-1", "jonas");
    await service.leftRoom(room, "jonas");
    // Anna is in the room, so she may end it.
    expect(await service.hangup("id-1", "anna")).toMatchObject({ id: "id-1" });
    expect(toBox.at(-1)).toEqual({ type: "hangup", call: "1729850000.12" });
  });

  it("can be taken back before the colleague answers", async () => {
    const { service } = await talking();
    await service.transfer("id-1", "jonas", { to: "anna" });
    expect(await service.cancelTransfer("id-1", "jonas")).toMatchObject({
      offeredTo: null,
      member: "jonas",
    });
    expect(await service.takeTransfer("id-1", "anna")).toBe("not-found");
  });

  it("to a number: the box dials it into the same room, the two talk once Jonas leaves", async () => {
    const { service, box, toBox, room } = await talking();
    expect(await service.transfer("id-1", "jonas", { number: "**610x" })).toBe("bad-number");
    const leg = (await service.transfer("id-1", "jonas", { number: "0171 2345678" })) as PhoneCall;
    expect(toBox).toContainEqual({ type: "dial", call: leg.id, room, number: "01712345678" });
    await box.receive({ ...event(3, "answered"), call: leg.id, direction: "out" });
    await service.leftRoom(room, "jonas");
    expect(toBox.some((m) => m.type === "hangup")).toBe(false);
    // The caller hangs up: nobody is left for the mobile phone, so it is hung up too.
    await box.receive(event(4, "ended", { cause: 16 }));
    expect(toBox).toContainEqual({ type: "hangup", call: leg.id });
  });

  it("dials a telephone at the Fritzbox by its internal number", async () => {
    const { service, toBox } = await talking();
    const leg = (await service.transfer("id-1", "jonas", { number: "**610" })) as PhoneCall;
    expect(leg.remote).toBe("**610");
    expect(toBox.at(-1)).toMatchObject({ type: "dial", number: "**610" });
  });
});

describe("dialling", () => {
  it("lets the line's people call out through the box, in the Fritzbox's way of dialling", async () => {
    const { service, toBox } = setup();
    expect(await service.dial("max", "07223 123456")).toBe("not-allowed");
    expect(await service.dial("jonas", "**610")).toBe("bad-number");
    const call = await service.dial("jonas", "+49 7223 123456");
    expect(call).toMatchObject({ direction: "out", member: "jonas", remote: "+497223123456" });
    expect(toBox).toContainEqual({
      type: "dial",
      call: (call as PhoneCall).id,
      room: (call as PhoneCall).room,
      number: "07223123456",
    });
  });

  it("hangs up when only one side is left in the room", async () => {
    const { service, toBox, phoneEvents } = setup();
    const call = (await service.dial("jonas", "07223 123456")) as PhoneCall;
    await service.joinedRoom(call.room!, "jonas");
    await service.joinedRoom(call.room!, "sip_07223123456");
    expect(phoneEvents().at(-1)!.event.call.present).toEqual(["jonas"]);
    await service.leftRoom(call.room!, "anna");
    expect(toBox.some((m) => m.type === "hangup")).toBe(false);
    await service.leftRoom(call.room!, "jonas");
    expect(toBox).toContainEqual({ type: "hangup", call: call.id });
  });

  it("needs a box online", async () => {
    const { service, box } = setup();
    box.close();
    expect(await service.dial("jonas", "07223 123456")).toBe("offline");
    expect(service.online()).toEqual([]);
  });
});
