/**
 * Push of state changes (RFC 8620 §7.3). The browser's EventSource cannot send an Authorization
 * header, so the event stream is read with fetch. Reconnects with a growing delay.
 */
import { fillTemplate, type JmapClient } from "./client";

export type StateChange = Record<string, Record<string, string>>;

/** Splits a server-sent-events buffer into complete events and the unfinished rest. */
export const parseEvents = (
  buffer: string,
): { events: { type: string; data: string }[]; rest: string } => {
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = blocks
    .map((block) => {
      let type = "message";
      const data: string[] = [];
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) type = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      return { type, data: data.join("\n") };
    })
    .filter((event) => event.data);
  return { events, rest };
};

export const subscribeToChanges = (
  client: JmapClient,
  onChange: (changed: StateChange) => void,
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
