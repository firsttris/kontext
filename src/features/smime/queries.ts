/**
 * S/MIME certificates from Kontext's server (/api/smime): one's own, in its .p12 as it came, and
 * others'; plus one's own opened in this tab (kept in memory only, gone on reload).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { OwnSmime } from "@/lib/smime";
import type { KnownCert, OwnCert } from "../../../server/smime/store";

export type { KnownCert, OwnCert };

const OWN = ["smime", "own"];
const KNOWN = ["smime", "known"];

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/smime${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

export const useOwnCert = () =>
  useQuery({
    queryKey: OWN,
    queryFn: async () => (await send<{ cert: OwnCert | null }>("GET", "/me")).cert,
  });

export const useKnownCerts = () =>
  useQuery({
    queryKey: KNOWN,
    queryFn: async () => (await send<{ certs: KnownCert[] }>("GET", "/certs")).certs,
  }).data ?? [];

export const useSmimeActions = () => {
  const queryClient = useQueryClient();
  const setOwn = useMutation({
    mutationFn: (cert: { certificate: string; p12: string }) =>
      send<{ cert: OwnCert }>("PUT", "/me", cert),
    onSuccess: ({ cert }) => queryClient.setQueryData(OWN, cert),
  });
  const removeOwn = useMutation({
    mutationFn: () => send("DELETE", "/me"),
    onSuccess: () => {
      lockSmime();
      queryClient.setQueryData(OWN, null);
    },
  });
  const remember = useMutation({
    mutationFn: (cert: { certificate: string; source: "mail" | "import"; email?: string }) =>
      send<{ certs: KnownCert[] }>("PUT", "/certs", cert),
    onSuccess: ({ certs }) => queryClient.setQueryData(KNOWN, certs),
  });
  const forget = useMutation({
    mutationFn: (email: string) => send<{ certs: KnownCert[] }>("POST", "/certs/remove", { email }),
    onSuccess: ({ certs }) => queryClient.setQueryData(KNOWN, certs),
  });
  return {
    setOwn: setOwn.mutateAsync,
    removeOwn: removeOwn.mutateAsync,
    remember: remember.mutateAsync,
    forget: forget.mutateAsync,
  };
};

/** One's certificate opened in this tab: in memory only, never stored. */
let opened: OwnSmime | null = null;
const listeners = new Set<() => void>();
const tell = () => {
  for (const listener of listeners) listener();
};

export const keepSmimeOpen = (own: OwnSmime) => {
  opened = own;
  tell();
};

export const lockSmime = () => {
  opened = null;
  tell();
};

export const useOpenSmime = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => opened,
  );
