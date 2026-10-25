// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createOutbox, pair, socketUrl } from "./link";

const event = {
  call: "1.1",
  state: "ringing" as const,
  direction: "in" as const,
  remote: "",
  local: "",
  at: "2026-10-25T09:00:00.000Z",
};

describe("createOutbox", () => {
  it("numbers events and keeps them until Kontext acknowledges", () => {
    const outbox = createOutbox();
    expect(outbox.add(event).seq).toBe(1);
    expect(outbox.add({ ...event, state: "ended" }).seq).toBe(2);
    outbox.ack(1);
    expect(outbox.pending().map((e) => e.seq)).toEqual([2]);
    outbox.ack(5);
    expect(outbox.pending()).toEqual([]);
  });
});

describe("pair", () => {
  it("trades the code for the box's token", async () => {
    const fetcher = (async (input: string, init?: RequestInit) => {
      expect(input).toBe("https://kontext.firma.de/api/phone/box/pair");
      expect(JSON.parse(String(init?.body))).toEqual({ code: "K7QM-4XPA" });
      return Response.json({ boxId: "b1", token: "t" });
    }) as typeof fetch;
    expect(await pair("https://kontext.firma.de/", "K7QM-4XPA", fetcher)).toEqual({
      url: "https://kontext.firma.de",
      boxId: "b1",
      token: "t",
    });
  });

  it("says why a code was refused", async () => {
    const fetcher = (async () =>
      Response.json(
        { error: "Code ungültig oder abgelaufen" },
        { status: 403 },
      )) as unknown as typeof fetch;
    await expect(pair("https://k.de", "x", fetcher)).rejects.toThrow(
      "Code ungültig oder abgelaufen",
    );
  });
});

describe("socketUrl", () => {
  it("speaks wss to an https Kontext", () => {
    expect(socketUrl("https://k.de")).toBe("wss://k.de/api/phone/box");
    expect(socketUrl("http://127.0.0.1:18090")).toBe("ws://127.0.0.1:18090/api/phone/box");
  });
});
