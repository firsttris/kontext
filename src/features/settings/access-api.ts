/**
 * The calls behind Einstellungen → Zugänge: the browsers signed in to Kontext (/api/access,
 * server/access/routes.ts) and the programs signed in at Stalwart (src/jmap/oauth-grants.ts).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { endOAuthGrant, listOAuthGrants } from "@/jmap/oauth-grants";
import type { Device } from "../../../server/access/devices";

export type { Device };

const send = async <T>(method: string, path: string): Promise<T> => {
  const response = await fetch(`/api/access${path}`, { method, credentials: "same-origin" });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

const DEVICES = ["access", "devices"];
const PROGRAMS = ["access", "programs"];

export const useDevices = () =>
  useQuery({
    queryKey: DEVICES,
    queryFn: async () => (await send<{ devices: Device[] }>("GET", "/sessions")).devices,
  });

const useChange = <T, R>(key: string[], change: (value: T) => Promise<R>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
};

export const useSignOutDevice = () =>
  useChange(DEVICES, (id: string) =>
    send<{ ok: true }>("DELETE", `/sessions/${encodeURIComponent(id)}`),
  );

export const useSignOutOthers = () =>
  useChange(DEVICES, () => send<{ ended: number }>("DELETE", "/sessions"));

export const usePrograms = () => {
  const client = useClient();
  return useQuery({ queryKey: PROGRAMS, queryFn: () => listOAuthGrants(client) });
};

export const useEndProgram = () => {
  const client = useClient();
  return useChange(PROGRAMS, (id: string) => endOAuthGrant(client, id));
};
