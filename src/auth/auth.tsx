/**
 * Login state. The Kontext server keeps the session (an httpOnly cookie, 90 days, renewed while
 * in use) and Stalwart's tokens; the browser only knows whether it is signed in.
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { signOutFrame } from "@/features/documents/frame-store";
import { createJmapClient, type JmapClient } from "@/jmap/client";
import { assertionJson, isCancelled, requestOptions, type SignInOptions } from "@/lib/webauthn";
import { markSignedIn } from "./idle-store";
import { signedOAuthQuery } from "./oauth-query";

/**
 * "continue": the sign-in was for an OAuth client (Schreibzeug, an agent); the browser goes on.
 * "cancelled": the person closed the browser's passkey dialog; "no-passkeys": the mail server
 * offers none (Stalwart before 1.1.0, or without a public URL).
 */
export type SignInResult =
  | "ok"
  | "mfa"
  | "failed"
  | "limited"
  | "offline"
  | "continue"
  | "cancelled"
  | "no-passkeys";

/** Sends the sign-in to the server and reads its answer. */
const postSignIn = async (body: Record<string, unknown>): Promise<SignInResult> => {
  const oauthQuery = signedOAuthQuery(window.location.search);
  try {
    const response = await fetch("/api/auth/sign-in/stalwart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ...body, ...(oauthQuery ? { oauth_query: oauthQuery } : {}) }),
    });
    if (response.status === 401 || response.status === 400) return "failed";
    // Too many wrong tries for this address or login name (server/failures.ts).
    if (response.status === 429) return "limited";
    if (!response.ok) return "offline";
    const answer = (await response.json()) as { status: "ok" | "mfa" } | { url: string };
    if ("url" in answer) {
      window.location.assign(answer.url);
      return "continue";
    }
    return answer.status;
  } catch {
    return "offline";
  }
};

/**
 * Signs in at the server; "mfa" means the account needs the code from the authenticator app.
 * A page opened by Kontext's sign-in provider carries the request it continues (oauth-query.ts).
 */
export const signIn = (email: string, password: string, code?: string): Promise<SignInResult> =>
  postSignIn({ email, password, ...(code ? { code } : {}) });

/**
 * Signs in with a passkey: Stalwart's challenge (through the server), the browser's dialog, the
 * answer back to the server, which hands it to Stalwart (server/stalwart.ts).
 */
export const signInWithPasskey = async (): Promise<SignInResult> => {
  const options = await fetch("/api/auth/sign-in/stalwart/passkey-options", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: "{}",
  }).catch(() => null);
  if (options?.status === 429) return "limited";
  if (options?.status === 404) return "no-passkeys";
  if (!options?.ok) return "offline";
  try {
    const credential = (await navigator.credentials.get({
      publicKey: requestOptions((await options.json()) as SignInOptions),
    })) as PublicKeyCredential | null;
    if (!credential) return "cancelled";
    return postSignIn({ passkey: assertionJson(credential) });
  } catch (error) {
    if (isCancelled(error)) return "cancelled";
    return "failed";
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
  loginWithPasskey: () => Promise<SignInResult>;
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

  const signedIn = useCallback(
    (result: SignInResult) => {
      if (result === "ok") {
        markSignedIn();
        const next = makeClient();
        setClient(next);
        onChange(next);
      }
      return result;
    },
    [makeClient, onChange],
  );

  const login = useCallback(
    async (email: string, password: string, code?: string) =>
      signedIn(await signIn(email, password, code)),
    [signedIn],
  );

  const loginWithPasskey = useCallback(async () => signedIn(await signInWithPasskey()), [signedIn]);

  const logout = useCallback(async () => {
    // Schreibzeug in its frame signs out first, while the frame is still there.
    await signOutFrame();
    await signOut();
    setClient(null);
    onChange(null);
  }, [onChange]);

  const value = useMemo(
    () => ({ client, login, loginWithPasskey, logout }),
    [client, login, loginWithPasskey, logout],
  );
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
