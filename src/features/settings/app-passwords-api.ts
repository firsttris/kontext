/** The calls for one's app passwords for CalDAV (/api/app-passwords, server/dav/app-password-routes.ts). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppPasswordInfo } from "../../../server/dav/app-passwords";

export type { AppPasswordInfo };

export type NewAppPassword = { name: string; password: string; code?: string };

export type NewAppPasswordResult =
  | { status: "ok"; password: string; info: AppPasswordInfo }
  | { status: "mfa" };

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/app-passwords${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

const KEY = ["app-passwords"];

export const useAppPasswords = () =>
  useQuery({
    queryKey: KEY,
    queryFn: async () => (await send<{ appPasswords: AppPasswordInfo[] }>("GET", "")).appPasswords,
  });

/** A change to the app passwords; the list is loaded again afterwards. */
const useChange = <T, R>(change: (value: T) => Promise<R>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
};

export const useCreateAppPassword = () =>
  useChange((input: NewAppPassword) => send<NewAppPasswordResult>("POST", "", input));

export const useRevokeAppPassword = () =>
  useChange((id: string) => send<{ ok: true }>("DELETE", `/${encodeURIComponent(id)}`));
