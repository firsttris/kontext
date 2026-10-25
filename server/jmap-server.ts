/**
 * JMAP on the server's own initiative (no request from a browser): it borrows the newest sign-in
 * of someone who may write in the account and talks to Stalwart directly. Used to put a mail into
 * a mailbox – a message left on the phone's mailbox, say (RFC 8620 §6.1 upload, RFC 8621 §4.8
 * Email/import).
 */
import type { Grants } from "./auth";
import type { Env } from "./env";
import { fillTemplate } from "./jmap";

const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];

type Session = {
  apiUrl: string;
  uploadUrl: string;
  accounts: Record<string, { isReadOnly?: boolean; accountCapabilities: Record<string, unknown> }>;
};

export type ServerJmapDeps = {
  env: Pick<Env, "STALWART_URL">;
  grants: Pick<Grants, "accessToken">;
  /** The newest sign-in session of every person who has one. */
  sessions: () => Promise<string[]>;
  fetch?: typeof fetch;
};

export type ImportResult = { ok: true; emailId: string } | { ok: false; error: string };

export const createServerJmap = ({ env, grants, sessions, fetch: get = fetch }: ServerJmapDeps) => {
  /** Session URLs may carry the public name; the server talks to Stalwart inside. */
  const onStalwart = (url: string) => {
    const parsed = new URL(url);
    return `${env.STALWART_URL}${parsed.pathname}${parsed.search}`;
  };

  /** Someone's sign-in that may write in this account, with its JMAP session. */
  const writerOf = async (accountId: string) => {
    for (const sessionId of await sessions()) {
      const token = await grants.accessToken(sessionId).catch(() => null);
      if (!token) continue;
      const auth = { authorization: `Bearer ${token}` };
      const response = await get(`${env.STALWART_URL}/jmap/session`, { headers: auth });
      if (!response.ok) continue;
      const session = (await response.json()) as Session;
      const account = session.accounts[accountId];
      if (account && !account.isReadOnly && USING[1]! in account.accountCapabilities) {
        return { auth, session };
      }
    }
    return null;
  };

  return {
    /** A whole RFC 5322 message into the account's inbox, unread. */
    importMessage: async (accountId: string, message: Uint8Array): Promise<ImportResult> => {
      const writer = await writerOf(accountId);
      if (!writer) return { ok: false, error: "Niemand angemeldet, der dort schreiben darf" };
      const { auth, session } = writer;
      const uploaded = await get(onStalwart(fillTemplate(session.uploadUrl, { accountId })), {
        method: "POST",
        headers: { ...auth, "content-type": "message/rfc822" },
        body: new Uint8Array(message),
      });
      if (!uploaded.ok) return { ok: false, error: `Hochladen: ${uploaded.status}` };
      const { blobId } = (await uploaded.json()) as { blobId: string };
      const call = async (methodCalls: unknown[]) => {
        const answer = await get(onStalwart(session.apiUrl), {
          method: "POST",
          headers: { ...auth, "content-type": "application/json" },
          body: JSON.stringify({ using: USING, methodCalls }),
        });
        if (!answer.ok) throw new Error(`JMAP: ${answer.status}`);
        const { methodResponses } = (await answer.json()) as {
          methodResponses: [string, Record<string, unknown>][];
        };
        return methodResponses[0]?.[1] ?? {};
      };
      try {
        // Result references only work at the top of a method's arguments (RFC 8620 §3.7), so the
        // inbox is looked up first.
        const inbox = (
          await call([["Mailbox/query", { accountId, filter: { role: "inbox" } }, "m"]])
        ).ids as string[] | undefined;
        if (!inbox?.[0]) return { ok: false, error: "Kein Posteingang" };
        const imported = await call([
          [
            "Email/import",
            {
              accountId,
              emails: { mail: { blobId, mailboxIds: { [inbox[0]]: true }, keywords: {} } },
            },
            "i",
          ],
        ]);
        const created = (imported.created as Record<string, { id: string }> | undefined)?.mail;
        return created ? { ok: true, emailId: created.id } : { ok: false, error: "Nicht angelegt" };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    },
  };
};

export type ServerJmap = ReturnType<typeof createServerJmap>;
