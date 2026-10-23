/**
 * Login state. The credentials live in sessionStorage, so closing the tab logs out; the JMAP
 * client sends them as Basic auth over the same origin (HTTPS in production).
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { type Credentials, createJmapClient, type JmapClient } from "@/jmap/client";

const STORAGE_KEY = "sekretaer.credentials";

const readStored = (): Credentials | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Credentials>;
    return parsed.username && parsed.password
      ? { username: parsed.username, password: parsed.password }
      : null;
  } catch {
    return null;
  }
};

const store = (credentials: Credentials | null): void => {
  try {
    if (credentials) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // private mode: stay logged in for this page only
  }
};

const clientFor = (credentials: Credentials | null): JmapClient | null =>
  credentials ? createJmapClient({ origin: window.location.origin, credentials }) : null;

export type Auth = {
  client: JmapClient | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<Auth | null>(null);

/** Created once at start, so the router can check the login before rendering. */
export const initialAuthClient = (): JmapClient | null => clientFor(readStored());

export const AuthProvider = ({
  initialClient,
  onChange,
  children,
}: {
  initialClient: JmapClient | null;
  onChange: (client: JmapClient | null) => void;
  children: ReactNode;
}) => {
  const [client, setClient] = useState(initialClient);

  const login = useCallback(
    async (credentials: Credentials) => {
      const next = clientFor(credentials)!;
      await next.fetchSession();
      store(credentials);
      setClient(next);
      onChange(next);
    },
    [onChange],
  );

  const logout = useCallback(() => {
    store(null);
    setClient(null);
    onChange(null);
  }, [onChange]);

  const value = useMemo(() => ({ client, login, logout }), [client, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): Auth => {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth outside AuthProvider");
  return auth;
};

/** The client of a logged-in page; the router guarantees a login there. */
export const useClient = (): JmapClient => {
  const { client } = useAuth();
  if (!client) throw new Error("Not logged in");
  return client;
};
