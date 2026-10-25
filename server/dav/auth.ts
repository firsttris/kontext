/**
 * Who a CalDAV client is: its mail address and password (an app password with two-factor sign-in)
 * are checked by Stalwart, whose JMAP session then says which mailboxes – and so which task
 * boards – the person has. A good answer is kept a few minutes, so a sync does not ask each time.
 */
import type { Env } from "../env";

export type DavAccount = { id: string; name: string; isReadOnly: boolean };
export type DavUser = { me: string; accounts: DavAccount[] };

const KEEP_MS = 5 * 60_000;
const MAIL = "urn:ietf:params:jmap:mail";

type Session = {
  primaryAccounts: Record<string, string>;
  accounts: Record<
    string,
    { name: string; isReadOnly?: boolean; accountCapabilities: Record<string, unknown> }
  >;
};

export const createDavAuth = (env: Pick<Env, "STALWART_URL">, now = () => Date.now()) => {
  const known = new Map<string, { user: DavUser; until: number }>();
  const keyOf = async (header: string) =>
    Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(header))).toString(
      "hex",
    );

  return async (header: string | undefined): Promise<DavUser | null> => {
    if (!header?.startsWith("Basic ")) return null;
    const key = await keyOf(header);
    const kept = known.get(key);
    if (kept && kept.until > now()) return kept.user;
    const response = await fetch(`${env.STALWART_URL}/jmap/session`, {
      headers: { authorization: header },
    }).catch(() => null);
    if (!response?.ok) {
      known.delete(key);
      return null;
    }
    const session = (await response.json()) as Session;
    const me = session.primaryAccounts[MAIL];
    if (!me) return null;
    const user: DavUser = {
      me,
      accounts: Object.entries(session.accounts)
        .filter(([, account]) => MAIL in account.accountCapabilities)
        .map(([id, account]) => ({
          id,
          name: account.name,
          isReadOnly: Boolean(account.isReadOnly),
        })),
    };
    known.set(key, { user, until: now() + KEEP_MS });
    return user;
  };
};
