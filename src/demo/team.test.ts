import { describe, expect, it } from "vitest";
import { createPhone, handlePhone } from "./phone";
import { createDemoServer } from "./server";
import { createStore } from "./store";
import { fillTeam } from "./team";

const ORIGIN = "https://demo.test";

const demo = async () => {
  const store = createStore();
  const handle = createDemoServer(store, ORIGIN);
  await fillTeam(store, handle, ORIGIN);
  const raw = async (person: string, path: string, init: RequestInit = {}) => {
    store.user = person;
    return (await handle(new Request(`${ORIGIN}${path}`, init)))!;
  };
  const as = async (person: string, path: string, init: RequestInit = {}) => {
    const response = await raw(person, path, init);
    return { status: response.status, body: await response.json() };
  };
  return { store, as, raw };
};

describe("chat and tasks in the demo", () => {
  it("are filled with the seed's conversation, as dev/demo-data.ts makes it", async () => {
    const { as, store } = await demo();
    // Filled by the people themselves; afterwards nobody is signed in, as at the start.
    expect(store.user).toBeNull();
    const { body } = await as("jonas", "/api/chat/channels");
    const names = (body.channels as { name: string | null; kind: string }[]).map(
      (c) => c.name ?? c.kind,
    );
    expect(names).toEqual(expect.arrayContaining(["allgemein", "baustelle-hoffmann", "direct"]));
    const tasks = await as("jonas", "/api/tasks");
    expect((tasks.body.tasks as { title: string }[]).map((t) => t.title)).toContain(
      "Baubesprechung Hoffmann vorbereiten",
    );
  });

  it("keeps what a visitor writes, and the file sent along", async () => {
    const { as, raw } = await demo();
    const form = new FormData();
    form.append("file", new File(["Aufmaß"], "notiz.txt", { type: "text/plain" }));
    const upload = await as("anna", "/api/chat/channels/team/files", {
      method: "POST",
      body: form,
    });
    await as("anna", "/api/chat/channels/team/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Kuchen 🎂", fileIds: [upload.body.file.id] }),
    });
    const { body } = await as("jonas", "/api/chat/channels/team/messages");
    const last = (body.messages as { text: string; files: { id: string }[] }[]).find(
      (m) => m.text === "Kuchen 🎂",
    )!;
    expect(last.files).toHaveLength(1);
    // The bytes come from memory (openFile), not from a disk the browser does not have.
    const file = await raw("jonas", `/api/chat/files/${last.files[0]!.id}`);
    expect(await file.text()).toBe("Aufmaß");
  });
});

describe("telephony in the demo", () => {
  const signedIn = (user: string) => ({ ...createStore(), user });
  const get = async (path: string, init: RequestInit = {}) => {
    const store = signedIn("jonas");
    const phone = createPhone(Date.parse("2026-10-30T12:00:00Z"));
    const response = (await handlePhone(
      store,
      phone,
      new Request(`${ORIGIN}${path}`, init),
      path,
    ))!;
    return { status: response.status, body: await response.json().catch(() => null), phone };
  };

  it("shows the past calls, with who took them", async () => {
    const { body } = await get("/api/phone");
    expect(body.enabled).toBe(true);
    const calls = body.calls as { outcome: string; member: string | null }[];
    expect(calls.some((c) => c.outcome === "missed")).toBe(true);
    expect(calls.some((c) => c.member === "anna")).toBe(true);
  });

  it("says that dialling needs the telephone box", async () => {
    const { status, body } = await get("/api/phone/dial", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ number: "+49721445566" }),
    });
    expect(status).toBe(409);
    expect(body.error).toContain("Telefonbox");
  });
});
