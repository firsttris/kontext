import { describe, expect, it, vi } from "vitest";
import type { JmapClient } from "./client";
import { CATCH_UP_AGAIN_MS, PING_SECONDS, parseEvents, subscribeToChanges } from "./push";

describe("parseEvents", () => {
  it("returns complete events and keeps the rest", () => {
    const { events, rest } = parseEvents(
      'event: state\ndata: {"changed":{"b":{"Email":"s1"}}}\n\n: ping\n\nevent: state\ndata: {"cha',
    );
    expect(events).toEqual([{ type: "state", data: '{"changed":{"b":{"Email":"s1"}}}' }]);
    expect(rest).toBe('event: state\ndata: {"cha');
  });
});

describe("subscribeToChanges", () => {
  it("catches up when connected and once more a little later", async () => {
    vi.useFakeTimers();
    const stream = new ReadableStream<Uint8Array>({ start: () => undefined });
    const fetchMock = vi.fn(async () => new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = {
      getSession: async () => ({ eventSourceUrl: "/jmap/eventsource/?types={types}" }),
      authHeaders: {},
    } as unknown as JmapClient;
    const connected = vi.fn();
    const stop = subscribeToChanges(client, () => undefined, connected);
    await vi.waitFor(() => expect(connected).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(CATCH_UP_AGAIN_MS);
    expect(connected).toHaveBeenCalledTimes(2);
    stop();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("asks for pings more often than Caddy's one-minute idle timeout", async () => {
    const fetchMock = vi.fn(
      async (_url: string) =>
        new Response(new ReadableStream<Uint8Array>({ start: () => undefined }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = {
      getSession: async () => ({ eventSourceUrl: "/jmap/eventsource/?ping={ping}" }),
      authHeaders: {},
    } as unknown as JmapClient;
    const stop = subscribeToChanges(client, () => undefined);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/jmap/eventsource/?ping=${PING_SECONDS}`);
    expect(PING_SECONDS).toBeLessThan(60);
    stop();
    vi.unstubAllGlobals();
  });
});
