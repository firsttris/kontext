/**
 * Push of state changes (RFC 8620 §7.3). The browser's EventSource cannot send an Authorization
 * header, so the event stream is read with fetch. Reconnects with a growing delay. Stalwart tells
 * only of changes after the stream is up (crates/jmap/src/api/event_source.rs), so `onConnected`
 * lets the app catch up on what happened before – on the first connect and after every drop.
 */
import { parseEvents } from "../../server/jmap";
import { fillTemplate, type JmapClient } from "./client";

export { parseEvents };

export type StateChange = Record<string, Record<string, string>>;

export const subscribeToChanges = (
  client: JmapClient,
  onChange: (changed: StateChange) => void,
  onConnected: () => void = () => undefined,
): (() => void) => {
  const controller = new AbortController();
  let delay = 1000;

  const connect = async (): Promise<void> => {
    const { eventSourceUrl } = await client.getSession();
    const url = fillTemplate(eventSourceUrl, { types: "*", closeafter: "no", ping: "60" });
    const response = await fetch(url, {
      headers: { ...client.authHeaders, accept: "text/event-stream" },
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok || !response.body) throw new Error(`Push ${response.status}`);
    delay = 1000;
    onConnected();
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      const parsed = parseEvents(buffer + value);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (event.type !== "state") continue;
        try {
          const { changed } = JSON.parse(event.data) as { changed: StateChange };
          onChange(changed);
        } catch {
          // ignore malformed events
        }
      }
    }
  };

  const loop = async (): Promise<void> => {
    while (!controller.signal.aborted) {
      try {
        await connect();
      } catch {
        // network error or server restart: retry below
      }
      if (controller.signal.aborted) return;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30_000);
    }
  };

  void loop();
  return () => controller.abort();
};
