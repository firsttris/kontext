/**
 * OpenPGP keys from Kontext's server (/api/pgp): one's own, locked as the browser made it, and
 * others' public keys; plus the key unlocked in this tab (kept in memory only, gone on reload).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PrivateKey } from "openpgp";
import { useSyncExternalStore } from "react";
import type { KnownKey, OwnKey } from "../../../server/pgp/store";

export type { KnownKey, OwnKey };

const OWN = ["pgp", "own"];
const KNOWN = ["pgp", "known"];

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/pgp${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

export const useOwnKey = () =>
  useQuery({
    queryKey: OWN,
    queryFn: async () => (await send<{ key: OwnKey | null }>("GET", "/me")).key,
  });

/** The keys of others one knows; with whether they have come yet (`useKnownKeys` is empty then). */
export const useKnownKeysQuery = () =>
  useQuery({
    queryKey: KNOWN,
    queryFn: async () => (await send<{ keys: KnownKey[] }>("GET", "/keys")).keys,
  });

export const useKnownKeys = () => useKnownKeysQuery().data ?? [];

export const usePgpActions = () => {
  const queryClient = useQueryClient();
  const setOwn = useMutation({
    mutationFn: (key: { publicKey: string; privateKey: string; recoveryKey: string }) =>
      send<{ key: OwnKey }>("PUT", "/me", key),
    onSuccess: ({ key }) => queryClient.setQueryData(OWN, key),
  });
  const removeOwn = useMutation({
    mutationFn: () => send("DELETE", "/me"),
    onSuccess: () => {
      lock();
      queryClient.setQueryData(OWN, null);
    },
  });
  const remember = useMutation({
    mutationFn: (key: { publicKey: string; source: string; email?: string }) =>
      send<{ keys: KnownKey[] }>("PUT", "/keys", key),
    onSuccess: ({ keys }) => queryClient.setQueryData(KNOWN, keys),
  });
  const forget = useMutation({
    mutationFn: (email: string) => send<{ keys: KnownKey[] }>("POST", "/keys/remove", { email }),
    onSuccess: ({ keys }) => queryClient.setQueryData(KNOWN, keys),
  });
  return {
    setOwn: setOwn.mutateAsync,
    removeOwn: removeOwn.mutateAsync,
    remember: remember.mutateAsync,
    forget: forget.mutateAsync,
    lookup: (email: string) =>
      send<{ publicKey: string | null; fingerprint?: string; source?: string }>(
        "GET",
        `/lookup?email=${encodeURIComponent(email)}`,
      ),
  };
};

/** The unlocked key of this tab: in memory only, never stored. */
let unlocked: PrivateKey | null = null;
const listeners = new Set<() => void>();
const tell = () => {
  for (const listener of listeners) listener();
};

/** The unlocked key, outside React (null when locked). */
export const currentUnlocked = () => unlocked;

export const keepUnlocked = (key: PrivateKey) => {
  unlocked = key;
  tell();
};

export const lock = () => {
  unlocked = null;
  tell();
};

export const useUnlockedKey = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => unlocked,
  );
