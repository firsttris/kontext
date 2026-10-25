/**
 * The box's line to Kontext: pairing once with the code from the Firmenverwaltung, then a
 * WebSocket that the box opens (no port open at the customer) and keeps open. Call events get a
 * number and are sent again after a reconnect until Kontext acknowledges them; without Kontext the
 * box keeps telephoning with its last configuration.
 */
import {
  type CallEvent,
  type FromBox,
  parseMessage,
  type ToBox,
  toBoxSchema,
} from "../../server/phone/protocol";

export type Credentials = { url: string; boxId: string; token: string };

/** Trades the pairing code for the box's token (once). */
export const pair = async (
  url: string,
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<Credentials> => {
  const response = await fetcher(`${url.replace(/\/$/, "")}/api/phone/box/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const result = (await response.json().catch(() => ({}))) as {
    boxId?: string;
    token?: string;
    error?: string;
  };
  if (!response.ok || !result.token || !result.boxId) {
    throw new Error(result.error ?? `Kopplung fehlgeschlagen (${response.status})`);
  }
  return { url: url.replace(/\/$/, ""), boxId: result.boxId, token: result.token };
};

export const socketUrl = (url: string) => `${url.replace(/^http/, "ws")}/api/phone/box`;

/** Events waiting for Kontext's ack, in order. Pure. */
export const createOutbox = () => {
  let seq = 0;
  let waiting: CallEvent[] = [];
  return {
    add: (event: Omit<CallEvent, "type" | "seq">): CallEvent => {
      const numbered: CallEvent = { ...event, type: "event", seq: ++seq };
      waiting = [...waiting, numbered];
      return numbered;
    },
    ack: (upTo: number) => {
      waiting = waiting.filter((event) => event.seq > upTo);
    },
    pending: () => waiting,
  };
};

const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export type Link = {
  /** Reports a call event; it goes out now or after the next reconnect. */
  event: (event: Omit<CallEvent, "type" | "seq">) => void;
  status: (registered: boolean, detail: string) => void;
  applied: (version: number, error?: string) => void;
  connected: () => boolean;
  close: () => void;
};

export const connect = (
  credentials: Credentials,
  { version, onCommand }: { version: string; onCommand: (command: ToBox) => void },
): Link => {
  const outbox = createOutbox();
  let socket: WebSocket | null = null;
  let open = false;
  let closed = false;
  let attempt = 0;
  let lastStatus: FromBox | null = null;

  const send = (message: FromBox) => {
    if (open) socket?.send(JSON.stringify(message));
  };

  const start = () => {
    socket = new WebSocket(socketUrl(credentials.url), {
      headers: { authorization: `Bearer ${credentials.token}` },
    } as unknown as string[]);
    socket.onopen = () => {
      open = true;
      attempt = 0;
      send({ type: "hello", version });
      if (lastStatus) send(lastStatus);
      for (const event of outbox.pending()) send(event);
    };
    socket.onmessage = (raw) => {
      const command = parseMessage(toBoxSchema, String(raw.data));
      if (!command) return;
      if (command.type === "ack") outbox.ack(command.seq);
      else onCommand(command);
    };
    socket.onclose = () => {
      open = false;
      if (closed) return;
      setTimeout(start, RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)]);
    };
    socket.onerror = () => socket?.close();
  };
  start();

  return {
    event: (event) => send(outbox.add(event)),
    status: (registered, detail) => {
      lastStatus = { type: "status", registered, detail };
      send(lastStatus);
    },
    applied: (version, error) => send({ type: "applied", version, ...(error ? { error } : {}) }),
    connected: () => open,
    close: () => {
      closed = true;
      socket?.close();
    },
  };
};
