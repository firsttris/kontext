/**
 * Login state. The Kontext server keeps the session (an httpOnly cookie, 90 days, renewed while
 * in use) and Stalwart's tokens; the browser only knows whether it is signed in.
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { signOutFrame } from "@/features/documents/frame-store";
import { createJmapClient, type JmapClient } from "@/jmap/client";
import { signedOAuthQuery } from "./oauth-query";

/** "continue": the sign-in was for an OAuth client (Schreibzeug, an agent); the browser goes on. */
export type SignInResult = "ok" | "mfa" | "failed" | "offline" | "continue";

/**
 * Signs in at the server; "mfa" means the account needs the code from the authenticator app.
 * A page opened by Kontext's sign-in provider carries the request it continues (oauth-query.ts).
 */
export const signIn = async (
  email: string,
  password: string,
  code?: string,
): Promise<SignInResult> => {
  const oauthQuery = signedOAuthQuery(window.location.search);
  try {
    const response = await fetch("/api/auth/sign-in/stalwart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        email,
        password,
        ...(code ? { code } : {}),
        ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
      }),
    });
    if (response.status === 401 || response.status === 400) return "failed";
    if (!response.ok) return "offline";
    const body = (await response.json()) as { status: "ok" | "mfa" } | { url: string };
    if ("url" in body) {
      window.location.assign(body.url);
      return "continue";
    }
    return body.status;
  } catch {
    return "offline";
  }
};

export const signOut = async (): Promise<void> => {
  await fetch("/api/auth/sign-out", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: "{}",
  }).catch(() => undefined);
};

/** Whether this browser has a session; asked once at start. */
export const hasSession = async (): Promise<boolean> => {
  try {
    const response = await fetch("/api/auth/get-session", { credentials: "same-origin" });
    if (!response.ok) return false;
    return (await response.json()) !== null;
  } catch {
    return false;
  }
};

export const createAppClient = (onUnauthorized: () => void): JmapClient =>
  createJmapClient({ origin: window.location.origin, onUnauthorized });

export type Auth = {
  client: JmapClient | null;
  login: (email: string, password: string, code?: string) => Promise<SignInResult>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

export const AuthProvider = ({
  initialClient,
  makeClient,
  onChange,
  children,
}: {
  initialClient: JmapClient | null;
  makeClient: () => JmapClient;
  onChange: (client: JmapClient | null) => void;
  children: ReactNode;
}) => {
  const [client, setClient] = useState(initialClient);

  const login = useCallback(
    async (email: string, password: string, code?: string) => {
      const result = await signIn(email, password, code);
      if (result === "ok") {
        const next = makeClient();
        setClient(next);
        onChange(next);
      }
      return result;
    },
    [makeClient, onChange],
  );

  const logout = useCallback(async () => {
    // Schreibzeug in its frame signs out first, while the frame is still there.
    await signOutFrame();
    await signOut();
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
