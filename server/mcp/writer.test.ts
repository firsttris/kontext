// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { JmapClient } from "@/jmap/client";
import type { Identity } from "@/jmap/types";
import type { AccountInfo, Reader } from "./reader";
import {
  appointmentForm,
  colleagueAddresses,
  createWriter,
  senderOf,
  type TaskApi,
  taskApiOf,
} from "./writer";

const account = (patch: Partial<AccountInfo> = {}): AccountInfo => ({
  id: "d",
  name: "jonas@weber-haustechnik.test",
  personal: true,
  readOnly: false,
  mail: true,
  calendars: true,
  contacts: true,
  ...patch,
});

const identity = (email: string): Identity => ({
  id: email,
  name: "Jonas Weber",
  email,
  replyTo: null,
  bcc: null,
  textSignature: "",
  htmlSignature: "",
});

describe("an agent's appointment", () => {
  it("is an hour from the start unless told otherwise", () => {
    expect(appointmentForm({ title: "Aufmaß", start: "2026-11-03 09:00" })).toMatchObject({
      title: "Aufmaß",
      date: "2026-11-03",
      startTime: "09:00",
      endDate: "2026-11-03",
      endTime: "10:00",
      allDay: false,
    });
    expect(
      appointmentForm({ title: "x", start: "2026-11-03T09:00", durationMinutes: 90 }).endTime,
    ).toBe("10:30");
    expect(
      appointmentForm({ title: "x", start: "2026-11-03 09:00", end: "2026-11-03 12:15" }).endTime,
    ).toBe("12:15");
  });

  it("is all day for a bare date", () => {
    expect(
      appointmentForm({ title: "Urlaub", start: "2026-12-24", end: "2026-12-31" }),
    ).toMatchObject({ allDay: true, date: "2026-12-24", endDate: "2026-12-31" });
  });

  it("needs a title, a date and an end after the start", () => {
    expect(() => appointmentForm({ title: " ", start: "2026-11-03 09:00" })).toThrow("Titel");
    expect(() => appointmentForm({ title: "x", start: "morgen" })).toThrow("Kein Datum");
    expect(() =>
      appointmentForm({ title: "x", start: "2026-11-03 09:00", end: "2026-11-03 08:00" }),
    ).toThrow("Ende");
  });
});

describe("whom an agent invites", () => {
  const team = [
    { id: "a", name: "Anna Weber", email: "anna@weber-haustechnik.test" },
    { id: "m", name: "Max Weber", email: "Max@weber-haustechnik.test" },
    { id: "x", name: "Ohne Adresse", email: null },
  ];
  const organizer = "jonas@weber-haustechnik.test";

  it("are colleagues, by address or id, each once, without the organizer", () => {
    expect(
      colleagueAddresses(
        ["Anna Weber <ANNA@weber-haustechnik.test>", "m", "anna@weber-haustechnik.test"],
        [...team, { id: "j", name: "Jonas", email: organizer }],
        organizer,
      ),
    ).toEqual(["anna@weber-haustechnik.test", "max@weber-haustechnik.test"]);
    expect(
      colleagueAddresses(["j"], [{ id: "j", name: "J", email: organizer }], organizer),
    ).toEqual([]);
  });

  it("never are people outside the company", () => {
    expect(() =>
      colleagueAddresses(["a", "markus.hoffmann@hoffmann-bau.test", "x"], team, organizer),
    ).toThrow(
      "Nur Kollegen der Firma können eingeladen werden (list_colleagues), nicht: markus.hoffmann@hoffmann-bau.test, x",
    );
  });

  it("refuse an entry that holds an outside address after a colleague's", () => {
    expect(() =>
      colleagueAddresses(
        ["anna@weber-haustechnik.test, markus.hoffmann@hoffmann-bau.test"],
        team,
        organizer,
      ),
    ).toThrow("Nur Kollegen");
  });

  it("are checked before anything is written", async () => {
    const call = vi.fn();
    const w = createWriter({
      client: { call } as unknown as JmapClient,
      reader: {
        accounts: async () => [account()],
        colleagues: async () => team,
      } as unknown as Reader,
      taskApi: async () => ({ status: 200, body: {} }),
    });
    call.mockResolvedValueOnce({ list: [{ id: "cal", name: "Kalender", isDefault: true }] });
    await expect(
      w.createAppointment({
        title: "Aufmaß",
        start: "2026-11-03 09:00",
        attendees: ["markus.hoffmann@hoffmann-bau.test"],
      }),
    ).rejects.toThrow("Nur Kollegen");
    expect(call.mock.calls.map(([method]) => method)).not.toContain("CalendarEvent/set");
  });
});

describe("the sender of a draft", () => {
  it("is the account's own address, else its first identity", () => {
    const info = account({ id: "b", name: "info@weber-haustechnik.test", personal: false });
    const identities = [
      identity("jonas@weber-haustechnik.test"),
      identity("info@weber-haustechnik.test"),
    ];
    expect(senderOf(identities, info)?.email).toBe("info@weber-haustechnik.test");
    expect(senderOf([identity("x@y.test")], info)?.email).toBe("x@y.test");
    expect(senderOf([], info)).toBeUndefined();
  });
});

describe("tasks through the task routes", () => {
  it("calls them in-process with JSON", async () => {
    const request = vi.fn(async (_path: string, init: RequestInit) =>
      Response.json({ echo: JSON.parse(String(init.body)) }, { status: 201 }),
    );
    const api = taskApiOf({ request });
    expect(await api("POST", "/", { title: "x" })).toEqual({
      status: 201,
      body: { echo: { title: "x" } },
    });
    expect(request.mock.calls[0]![1]).toMatchObject({
      method: "POST",
      headers: { "content-type": "application/json" },
    });
  });

  const writer = (taskApi: TaskApi, accounts = [account()]) =>
    createWriter({
      client: {} as JmapClient,
      reader: { accounts: async () => accounts } as unknown as Reader,
      taskApi,
    });

  it("creates a task on the own board unless another is named", async () => {
    const taskApi = vi.fn<TaskApi>(async (_m, _p, body) => ({
      status: 201,
      body: { task: { id: "t1", title: (body as { title: string }).title, dueDate: "2026-11-02" } },
    }));
    const done = await writer(taskApi).createTask({
      title: "Rückruf Keller",
      dueDate: "2026-11-02",
    });
    expect(done).toEqual({
      message: "Aufgabe „Rückruf Keller“ angelegt, fällig 2026-11-02.",
      taskId: "t1",
    });
    expect(taskApi).toHaveBeenCalledWith(
      "POST",
      "/",
      expect.objectContaining({ accountId: "d", links: [] }),
    );
    await writer(taskApi).createTask({ title: "x", accountId: "b" });
    expect(taskApi).toHaveBeenLastCalledWith(
      "POST",
      "/",
      expect.objectContaining({ accountId: "b" }),
    );
  });

  it("passes on what the routes refuse, e.g. a read-only board", async () => {
    const refuse: TaskApi = async () => ({
      status: 403,
      body: { error: "Dieses Postfach ist nur zum Lesen." },
    });
    await expect(writer(refuse).createTask({ title: "x" })).rejects.toThrow("nur zum Lesen");
    await expect(writer(refuse).updateTask({ taskId: "t1", status: "done" })).rejects.toThrow(
      "nur zum Lesen",
    );
  });
});

describe("writing in a mailbox", () => {
  it("is refused where the account may only be read", async () => {
    const readOnly = account({
      id: "c",
      name: "rechnung@weber-haustechnik.test",
      personal: false,
      readOnly: true,
    });
    const w = createWriter({
      client: {} as JmapClient,
      reader: { accounts: async () => [account(), readOnly] } as unknown as Reader,
      taskApi: async () => ({ status: 200, body: {} }),
    });
    await expect(w.createDraft({ accountId: "c", text: "x", to: ["a@b.test"] })).rejects.toThrow(
      "nur zum Lesen",
    );
    await expect(
      w.createAppointment({ accountId: "zz", title: "x", start: "2026-11-03" }),
    ).rejects.toThrow("Unbekanntes Konto");
  });
});
