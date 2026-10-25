/**
 * The live connection: every open app holds one (Server-Sent Events, /api/live) and hears what
 * changed for its person – new chat messages, someone typing, tasks of their mailboxes, calls. The hub
 * only keeps who is connected; each event names who may hear it.
 */
import type { Call } from "../calls/calls";
import type { Message, Viewer } from "../chat/chat";
import type { PhoneCall } from "../phone/phone";

export type LiveEvent =
  | { type: "message"; channelId: string; message: Message }
  // Edited or deleted.
  | { type: "changed"; channelId: string; message: Message }
  | { type: "typing"; channelId: string; memberId: string }
  | { type: "read"; channelId: string; memberId: string; at: string }
  | { type: "channels" }
  | { type: "presence"; online: string[] }
  | { type: "tasks"; accountId: string }
  // A call began, someone joined or left, or it ended (null).
  | { type: "call"; channelId: string; call: Call | null }
  | { type: "call-declined"; channelId: string; memberId: string }
  // A phone call through the telephone box rang, was taken, ended or got a note.
  | { type: "phone"; call: PhoneCall };

type Listener = { viewer: Viewer; send: (event: LiveEvent) => void };

export type Hub = {
  /** Adds a connection; the function it returns removes it again. */
  subscribe: (viewer: Viewer, send: (event: LiveEvent) => void) => () => void;
  /** Sends the event to every connection whose person `to` lets through. */
  publish: (event: LiveEvent, to: (viewer: Viewer) => boolean) => void;
  /** Everyone with at least one open connection. */
  online: () => string[];
};

export const createHub = (): Hub => {
  const listeners = new Set<Listener>();
  const online = () => [...new Set([...listeners].map((listener) => listener.viewer.me))];
  const publish: Hub["publish"] = (event, to) => {
    for (const listener of listeners) {
      if (!to(listener.viewer)) continue;
      try {
        listener.send(event);
      } catch {
        // A connection that just closed; its own cleanup removes it.
      }
    }
  };
  const announce = (before: string[]) => {
    const now = online();
    if (now.length !== before.length) publish({ type: "presence", online: now }, () => true);
  };
  return {
    subscribe: (viewer, send) => {
      const before = online();
      const listener = { viewer, send };
      listeners.add(listener);
      announce(before);
      return () => {
        const before = online();
        listeners.delete(listener);
        announce(before);
      };
    },
    publish,
    online,
  };
};
