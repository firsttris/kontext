/**
 * Whether Stalwart is set up for Kontext's sign-in: Kontext signs in as the OAuth client `kontext`
 * and asks for the scope `full` (server/stalwart.ts). Stalwart refuses the sign-in when the client
 * is missing ("Unknown client id") or does not allow `full` (`invalid_scope`, since 1.0.3;
 * crates/http/src/auth/oauth/authorize.rs). Read from `x:OAuthClient` with the server's key, so
 * the admin sees what is missing before someone fails to sign in. Pure, the call is in
 * management.ts.
 */
import { CLIENT_ID } from "../stalwart";

/** One client as `x:OAuthClient/get` returns it (crates/registry/src/schema/structs.rs). */
export type OAuthClientEntry = { clientId: string; scopes?: Record<string, boolean> };

export type KontextClientStatus = "ok" | "missing" | "noFullScope";

export const kontextClientStatus = (clients: OAuthClientEntry[]): KontextClientStatus => {
  const client = clients.find((entry) => entry.clientId === CLIENT_ID);
  if (!client) return "missing";
  return client.scopes?.full ? "ok" : "noFullScope";
};

/** The line for the server log, or null when nothing is missing. */
export const kontextClientWarning = (status: KontextClientStatus): string | null => {
  if (status === "missing")
    return `Stalwart kennt den OAuth-Client "${CLIENT_ID}" nicht: niemand kann sich anmelden. Siehe docs/installation.md, Schritt 12.`;
  if (status === "noFullScope")
    return `Dem OAuth-Client "${CLIENT_ID}" in Stalwart fehlt der Scope "full": niemand kann sich neu anmelden. Siehe docs/installation.md, "Stalwart 1.0.3".`;
  return null;
};
