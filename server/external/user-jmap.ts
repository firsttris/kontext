/**
 * JMAP with the signed-in person's own token: what they may do in Stalwart, nothing more. Used to
 * read a mail before it goes out through another provider and to file it under Sent afterwards.
 */
import type { Grants } from "../auth";
import type { Env } from "../env";

const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];

type JmapSession = { apiUrl: string; downloadUrl: string };

export type UserJmap = {
  call: <T>(calls: unknown[]) => Promise<(T | undefined)[]>;
  download: (accountId: string, blobId: string) => Promise<Uint8Array>;
};

export const createUserJmap =
  (env: Pick<Env, "STALWART_URL">, grants: Pick<Grants, "accessToken">) =>
  async (sessionId: string): Promise<UserJmap | null> => {
    const token = await grants.accessToken(sessionId);
    if (!token) return null;
    const auth = { authorization: `Bearer ${token}` };
    const response = await fetch(`${env.STALWART_URL}/jmap/session`, { headers: auth });
    if (!response.ok) return null;
    const session = (await response.json()) as JmapSession;
    /** The same path on the Stalwart the server talks to (the session may name the public host). */
    const onStalwart = (url: string) => {
      const parsed = new URL(url);
      return `${env.STALWART_URL}${parsed.pathname}${parsed.search}`;
    };

    const call: UserJmap["call"] = async <T>(calls: unknown[]) => {
      const answer = await fetch(onStalwart(session.apiUrl), {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ using: USING, methodCalls: calls }),
      });
      if (!answer.ok) throw new Error(`JMAP ${answer.status}`);
      const { methodResponses } = (await answer.json()) as { methodResponses: [string, T][] };
      return methodResponses.map(([name, result]) => (name === "error" ? undefined : result));
    };

    const download: UserJmap["download"] = async (accountId, blobId) => {
      // RFC 8620 §6.2: the URL template with the account, the blob, a name and a type.
      const url = session.downloadUrl
        .replace("{accountId}", encodeURIComponent(accountId))
        .replace("{blobId}", encodeURIComponent(blobId))
        .replace("{name}", "mail.eml")
        .replace("{type}", encodeURIComponent("message/rfc822"));
      const answer = await fetch(onStalwart(url), { headers: auth });
      if (!answer.ok) throw new Error(`Mail nicht lesbar (${answer.status})`);
      return new Uint8Array(await answer.arrayBuffer());
    };

    return { call, download };
  };
