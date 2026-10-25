/**
 * The calls for one's agent access keys to the Kontext server (/api/mcp-keys,
 * server/mcp/routes.ts), and the setup line for Claude Code.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { McpKeyInfo } from "../../../server/mcp/keys";

export type { McpKeyInfo };

export type NewKey = { name: string; password: string; code?: string };

export type NewKeyResult = { status: "ok"; key: string; info: McpKeyInfo } | { status: "mfa" };

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/mcp-keys${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

const KEYS = ["mcp-keys"];

export const useMcpKeys = () =>
  useQuery({
    queryKey: KEYS,
    queryFn: async () => (await send<{ keys: McpKeyInfo[] }>("GET", "")).keys,
  });

/** A change to the keys; the list is loaded again afterwards. */
const useKeyChange = <T, R>(change: (value: T) => Promise<R>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEYS }),
  });
};

export const useCreateKey = () =>
  useKeyChange((key: NewKey) => send<NewKeyResult>("POST", "", key));

export const useRevokeKey = () =>
  useKeyChange((id: string) => send<{ ok: true }>("DELETE", `/${encodeURIComponent(id)}`));

/** The address agents talk to. */
export const mcpAddress = (origin: string): string => `${origin}/mcp`;

/** Claude Code's command to add Kontext (streamable HTTP with the key as bearer token). */
export const claudeCodeCommand = (origin: string, key: string): string =>
  `claude mcp add --transport http kontext ${mcpAddress(origin)} --header "Authorization: Bearer ${key}"`;
