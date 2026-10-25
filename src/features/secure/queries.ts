/** "Vertraulich senden" from Kontext's server (/api/secure, /api/secure-public). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";

export type SecureSummary = {
  id: string;
  to: string;
  createdAt: string;
  expiresAt: string;
  openedAt: string | null;
  openCount: number;
  replies: number;
  unreadReplies: number;
  state: "open" | "locked" | "expired";
};

export const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw Object.assign(new Error(result.error ?? String(response.status)), {
      status: response.status,
      result,
    });
  }
  return result;
};

const KEY = ["secure"];

export const useSecureMessages = () =>
  useQuery({
    queryKey: KEY,
    queryFn: async () => (await send<{ messages: SecureSummary[] }>("GET", "secure")).messages,
  }).data ?? [];

export const useSecureActions = () => {
  const queryClient = useQueryClient();
  const settle = () => queryClient.invalidateQueries({ queryKey: KEY });
  const newCode = useMutation({
    mutationFn: ({ id, code }: { id: string; code: string }) =>
      send("POST", `secure/${encodeURIComponent(id)}/code`, { code }),
    onSettled: settle,
  });
  const remove = useMutation({
    mutationFn: (id: string) => send("DELETE", `secure/${encodeURIComponent(id)}`),
    onSettled: settle,
  });
  return { newCode: newCode.mutateAsync, remove: remove.mutateAsync, settle };
};

/** The codes of what was just sent, until the sender has passed them on. */
export type SentCode = { to: string; code: string };
let codes: SentCode[] = [];
const listeners = new Set<() => void>();
export const showCodes = (next: SentCode[]) => {
  codes = next;
  for (const listener of listeners) listener();
};
export const useShownCodes = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => codes,
  );
