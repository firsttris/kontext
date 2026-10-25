/**
 * Who is asking, from their sign-in session: the accounts of their JMAP session (asked of
 * Stalwart with their token) and their display name (from their identity). Kept for half a
 * minute per session – "schreibt …" asks every three seconds; changed access counts after that.
 */
import type { Auth, Grants } from "./auth";
import type { SessionAccount } from "./categories/routes";
import type { Env } from "./env";

export type SessionInfo = { sessionId: string; accounts: SessionAccount[]; name: string };

const FRESH_MS = 30_000;

/** The same path on the Stalwart the server talks to (the session may name the public host). */
const onStalwart = (env: Env, url: string) => {
  const parsed = new URL(url);
  return `${env.STALWART_URL}${parsed.pathname}${parsed.search}`;
};

type JmapSession = {
  apiUrl: string;
  accounts: Record<string, { name?: string; isReadOnly?: boolean; isPersonal?: boolean }>;
  primaryAccounts: Record<string, string>;
};

/** The display name the person sends mail as, else their address. */
const displayName = async (env: Env, token: string, session: JmapSession, email: string) => {
  const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"];
  if (!accountId) return email;
  const response = await fetch(onStalwart(env, session.apiUrl), {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:submission"],
      methodCalls: [["Identity/get", { accountId }, "i"]],
    }),
  }).catch(() => null);
  if (!response?.ok) return email;
  const { methodResponses } = (await response.json()) as {
    methodResponses: [string, { list?: { email: string; name: string }[] }][];
  };
  const identities = methodResponses[0]?.[1].list ?? [];
  const own = identities.find((identity) => identity.email.toLowerCase() === email.toLowerCase());
  return own?.name || identities[0]?.name || email;
};

/** The display name behind a Stalwart token: what the person sends mail as, else the address. */
export const createNameOf = (env: Env) => async (token: string, email: string) => {
  const response = await fetch(`${env.STALWART_URL}/jmap/session`, {
    headers: { authorization: `Bearer ${token}` },
  }).catch(() => null);
  if (!response?.ok) return email;
  return displayName(env, token, (await response.json()) as JmapSession, email);
};

export const createSessionInfo = (env: Env, auth: Auth, grants: Grants) => {
  const known = new Map<string, { info: SessionInfo; until: number }>();

  const infoOf = async (request: Request): Promise<SessionInfo | null> => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) return null;
    const now = Date.now();
    const cached = known.get(session.session.id);
    if (cached && cached.until > now) return cached.info;
    const token = await grants.accessToken(session.session.id);
    if (!token) return null;
    const response = await fetch(`${env.STALWART_URL}/jmap/session`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const jmap = (await response.json()) as JmapSession;
    const info: SessionInfo = {
      sessionId: session.session.id,
      accounts: Object.entries(jmap.accounts).map(([id, account]) => ({
        id,
        isReadOnly: Boolean(account.isReadOnly),
        isPersonal: Boolean(account.isPersonal),
        name: account.name,
      })),
      name: await displayName(env, token, jmap, session.user.email),
    };
    for (const [id, entry] of known) if (entry.until <= now) known.delete(id);
    known.set(session.session.id, { info, until: now + FRESH_MS });
    return info;
  };

  return {
    infoOf,
    accountsOf: async (request: Request) => (await infoOf(request))?.accounts ?? null,
  };
};
