/**
 * Who a CalDAV client is: its mail address and password are checked by Stalwart – or, with
 * two-step sign-in, an app password of Kontext's (app-passwords.ts), whose own Stalwart grant then
 * stands in. Stalwart's JMAP session (sorted by `accountRights`) then says which mailboxes – and
 * so which task boards – the person has, and which they may change. A good answer is kept a
 * minute, so a sync does not ask each time – and a locked account or a lost mailbox counts here
 * at most a minute later. An app password is looked up on every request, so a revoked one stops
 * at once.
 */
import {
  accountRights,
  callsPerRequest,
  createFoldersOf,
  type JmapSessionAccount,
} from "../account-rights";
import type { Env } from "../env";
import { createLoginFailures, type FailureLimit, loginKey } from "../failures";
import type { AppPasswordOwner } from "./app-passwords";

export type DavAccount = { id: string; name: string; isReadOnly: boolean };
export type DavUser = { me: string; accounts: DavAccount[] };

const KEEP_MS = 60_000;
const MAIL = "urn:ietf:params:jmap:mail";

type Session = {
  apiUrl: string;
  capabilities?: Record<string, { maxCallsInRequest?: number } | undefined>;
  primaryAccounts: Record<string, string>;
  accounts: Record<string, JmapSessionAccount & { name: string }>;
};

/** App passwords: their owner, and the access token of the owner's grant for it. */
export type AppPasswordCheck = {
  resolve: (email: string, password: string) => Promise<AppPasswordOwner | null>;
  /** The grant's token; null when it ended, "unavailable" while Stalwart is away. */
  tokenOf: (sessionId: string) => Promise<string | null | "unavailable">;
};

/** Login name and password in a Basic header; "" for what cannot be read. */
const credentialsOf = (header: string) => {
  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const colon = Math.max(decoded.indexOf(":"), 0);
  return {
    login: decoded.slice(0, colon).trim().toLowerCase(),
    password: colon ? decoded.slice(colon + 1) : "",
  };
};

export const createDavAuth = (
  env: Pick<Env, "STALWART_URL">,
  now = () => Date.now(),
  failures: FailureLimit = createLoginFailures(now),
  appPasswords: AppPasswordCheck | null = null,
) => {
  const known = new Map<string, { user: DavUser; until: number }>();
  const keyOf = async (header: string) =>
    Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(header))).toString(
      "hex",
    );

  /** The person behind an Authorization header Stalwart accepts; null when it does not. */
  const userWith = async (
    authorization: string,
    refused: (status: number | undefined) => void,
  ): Promise<DavUser | null> => {
    const response = await fetch(`${env.STALWART_URL}/jmap/session`, {
      headers: { authorization },
    }).catch(() => null);
    if (!response?.ok) {
      refused(response?.status);
      return null;
    }
    return userOf((await response.json()) as Session, authorization);
  };

  const userOf = async (session: Session, authorization: string): Promise<DavUser | null> => {
    const me = session.primaryAccounts[MAIL];
    if (!me) return null;
    const mail = Object.fromEntries(
      Object.entries(session.accounts).filter(
        ([, account]) => MAIL in (account.accountCapabilities ?? {}),
      ),
    );
    const api = new URL(session.apiUrl);
    const foldersOf = createFoldersOf(
      `${env.STALWART_URL}${api.pathname}${api.search}`,
      authorization,
      fetch,
      callsPerRequest(session),
    );
    return {
      me,
      accounts: (await accountRights(mail, foldersOf)).map(({ id, name, isReadOnly }) => ({
        id,
        name: name ?? "",
        isReadOnly,
      })),
    };
  };

  /** Kept a minute, under `key`; a failed answer drops what was kept. */
  const kept = async (key: string, find: () => Promise<DavUser | null>) => {
    const found = known.get(key);
    if (found && found.until > now()) return found.user;
    const user = await find();
    if (user) known.set(key, { user, until: now() + KEEP_MS });
    else known.delete(key);
    return user;
  };

  /** The person behind an app password, through its own grant; undefined when it is none. */
  const viaAppPassword = async (login: string, password: string) => {
    const owner = appPasswords && (await appPasswords.resolve(login, password));
    if (!owner) return undefined;
    return kept(`app:${owner.id}`, async () => {
      const token = await appPasswords.tokenOf(owner.sessionId);
      return token && token !== "unavailable" ? userWith(`Bearer ${token}`, () => undefined) : null;
    });
  };

  /** `client` is the caller's address (Caddy's X-Forwarded-For). */
  return async (header: string | undefined, client = ""): Promise<DavUser | null> => {
    if (!header?.startsWith("Basic ")) return null;
    const key = await keyOf(header);
    const recent = known.get(key);
    if (recent && recent.until > now()) return recent.user;
    const credentials = credentialsOf(header);
    // Guessing stops here, per login name and per address, before it reaches Stalwart.
    const [login, address] = [loginKey(credentials.login), `client:${client}`];
    const counted = [login, address];
    if (counted.some(failures.blocked)) return null;
    const viaApp = await viaAppPassword(credentials.login, credentials.password);
    if (viaApp !== undefined) return viaApp;
    // Anything else – a revoked or mistyped app password too – Stalwart decides, and counts.
    const user = await kept(key, () =>
      userWith(header, (status) => {
        if (status === 401) for (const counter of counted) failures.failed(counter, key);
      }),
    );
    if (user) failures.cleared(login);
    return user;
  };
};
