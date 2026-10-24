/**
 * Calls from Kontext's server (/api/calls): which ones run in channels one sees, joining one and
 * saying no. The live connection keeps the list current (features/live).
 */
import { type QueryClient, useQuery } from "@tanstack/react-query";
import type { Call } from "@/lib/calls";
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

/** Into the call of a channel (one opens it by joining): a ticket, then the call panel opens. */
export const joinCall = async (channelId: string, video: boolean) => {
  const { token, url } = await send<{ token: string; url: string | null }>(
    "POST",
    `${channelPath(channelId)}/join`,
    { video },
  );
  const own = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;
  enterCall({ channelId, token, url: url ?? own, video, joinedAt: Date.now() });
};

export const declineCall = (channelId: string) =>
  send<unknown>("POST", `${channelPath(channelId)}/decline`).catch(() => undefined);
