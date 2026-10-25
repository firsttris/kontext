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
    callOfRoom: async (room: string) => [...calls.values()].find((c) => c.room === room) ?? null,
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

  it("hangs up the call of whoever left its room", async () => {
    const { service, toBox } = setup();
    const call = (await service.dial("jonas", "07223 123456")) as PhoneCall;
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
