/**
 * Calls from Kontext's server (/api/calls): which ones run in channels one sees, joining one and
 * saying no. The live connection keeps the list current (features/live).
 */
import { type QueryClient, useQuery } from "@tanstack/react-query";
import type { Call } from "@/lib/calls";
import { m } from "@/paraglide/messages";
import { callEnded, enterCall } from "./call-store";

export const CALLS_KEY = ["calls"];

type CallsData = { enabled: boolean; calls: Call[] };

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/calls${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

/** Running calls; `enabled` is false when the server has no LiveKit (no call buttons then). */
export const useCalls = () => {
  const { data } = useQuery({
    queryKey: CALLS_KEY,
    queryFn: () => send<CallsData>("GET", ""),
    staleTime: Number.POSITIVE_INFINITY,
  });
  return { enabled: data?.enabled ?? false, calls: data?.calls ?? [] };
};

export const useCall = (channelId: string): Call | null =>
  useCalls().calls.find((call) => call.channelId === channelId) ?? null;

/** A call began, changed or ended (null), as the live connection tells it. */
export const setCall = (queryClient: QueryClient, channelId: string, call: Call | null) => {
  queryClient.setQueryData<CallsData>(CALLS_KEY, (data) => {
    if (!data) return data;
    const others = data.calls.filter((candidate) => candidate.channelId !== channelId);
    return { ...data, calls: call ? [...others, call] : others };
  });
  if (!call) callEnded(channelId);
};

const channelPath = (id: string) => `/${encodeURIComponent(id)}`;

type Ticket = {
  token: string;
  url: string | null;
  /** A confidential channel: the call goes end-to-end encrypted with this sealed key. */
  confidential?: boolean;
  sealedKey?: string | null;
};

/**
 * Into the call of a channel (one opens it by joining): a ticket, then the call panel opens. In
 * a confidential channel with the call's key (src/features/calls/call-key.ts), made by whoever
 * comes first.
 */
export const joinCall = async (channelId: string, video: boolean) => {
  const path = `${channelPath(channelId)}/join`;
  let ticket = await send<Ticket>("POST", path, { video });
  let e2eeKey: string | undefined;
  if (ticket.confidential) {
    const { newCallKey, openCallKey } = await import("./call-key");
    if (!ticket.sealedKey) {
      ticket = await send<Ticket>("POST", path, { video, sealedKey: await newCallKey(channelId) });
    }
    e2eeKey = await openCallKey(channelId, ticket.sealedKey!);
  }
  const own = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  enterCall({
    channelId,
    token: ticket.token,
    url: ticket.url ?? own,
    video,
    joinedAt: Date.now(),
    e2eeKey,
  });
};

/** What to say when joining failed: a locked key is something one can fix. */
export const joinFailure = (error: unknown) =>
  (error as Error | undefined)?.message === m.call_confidential_locked()
    ? m.call_confidential_locked()
    : m.call_failed();

export const declineCall = (channelId: string) =>
  send<unknown>("POST", `${channelPath(channelId)}/decline`).catch(() => undefined);

/** A new meeting link for a calendar event (…/meet/<id>). */
export const createMeeting = async (): Promise<string> => {
  const response = await fetch("/api/meet", { method: "POST", credentials: "same-origin" });
  if (!response.ok) throw new Error(String(response.status));
  return ((await response.json()) as { url: string }).url;
};
