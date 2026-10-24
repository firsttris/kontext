/**
 * The live connection to Kontext's server (/api/live, Server-Sent Events): chat messages, typing,
 * read marks, presence, changed tasks and calls reach the open views at once. The browser reconnects by
 * itself; after a reconnect everything live is fetched again, in case something was missed.
 */
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { heardDeclined } from "@/features/calls/call-store";
import { CALLS_KEY, setCall } from "@/features/calls/queries";
import {
  addMessage,
  CHANNELS_KEY,
  CHAT_KEY,
  type ChannelsData,
  DISCUSSED_KEY,
  setRead,
} from "@/features/chat/queries";
import { startTyping, stopTyping } from "@/features/chat/typing";
import type { Message } from "@/lib/chat";
import type { LiveEvent } from "../../../server/live/hub";

const TASKS_KEY = ["tasks"];
/** When the server refused the connection (signed out, restarting): try again after this. */
const RETRY_MS = 10_000;

export const applyLiveEvent = (queryClient: QueryClient, me: string, event: LiveEvent) => {
  switch (event.type) {
    case "message": {
      const { message } = event;
      addMessage(queryClient, message);
      stopTyping(message.channelId, message.authorId);
      void queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
      // A mail shows where it was discussed and how many answers came since.
      void queryClient.invalidateQueries({ queryKey: DISCUSSED_KEY });
      return;
    }
    case "changed":
      // Edited or deleted: in place, without a notification.
      addMessage(queryClient, event.message);
      void queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
      return;
    case "typing":
      if (event.memberId !== me) startTyping(event.channelId, event.memberId);
      return;
    case "read":
      setRead(queryClient, event.channelId, event.memberId, event.at);
      // Read on another device: the counts here go down too.
      if (event.memberId === me) void queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
      return;
    case "channels":
      void queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });
      return;
    case "presence":
      queryClient.setQueryData<ChannelsData>(CHANNELS_KEY, (data) =>
        data ? { ...data, online: event.online } : data,
      );
      return;
    case "tasks":
      void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      return;
    case "call":
      setCall(queryClient, event.channelId, event.call);
      return;
    case "call-declined":
      heardDeclined(event.channelId, event.memberId);
      return;
  }
};

const EVENT_TYPES: LiveEvent["type"][] = [
  "message",
  "changed",
  "typing",
  "read",
  "channels",
  "presence",
  "tasks",
  "call",
  "call-declined",
];

/** `onMessage` hears every new chat message (for notifications). */
export const useLive = (me: string, onMessage?: (message: Message) => void) => {
  const queryClient = useQueryClient();
  const heard = useRef(onMessage);
  heard.current = onMessage;

  useEffect(() => {
    if (!me || typeof EventSource === "undefined") return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let lost = false;
    const connect = () => {
      source = new EventSource("/api/live", { withCredentials: true });
      source.onopen = () => {
        if (!lost) return;
        lost = false;
        void queryClient.invalidateQueries({ queryKey: CHAT_KEY });
        void queryClient.invalidateQueries({ queryKey: TASKS_KEY });
        void queryClient.invalidateQueries({ queryKey: CALLS_KEY });
      };
      source.onerror = () => {
        lost = true;
        // A refused connection is not retried by the browser; a dropped one is.
        if (source?.readyState === EventSource.CLOSED) retry = setTimeout(connect, RETRY_MS);
      };
      for (const type of EVENT_TYPES) {
        source.addEventListener(type, (raw) => {
          const event = JSON.parse((raw as MessageEvent<string>).data) as LiveEvent;
          applyLiveEvent(queryClient, me, event);
          if (event.type === "message") heard.current?.(event.message);
        });
      }
    };
    connect();
    return () => {
      clearTimeout(retry);
      source?.close();
    };
  }, [me, queryClient]);
};
