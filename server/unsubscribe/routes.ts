/**
 * /api/unsubscribe: the one-click unsubscribe (RFC 8058), posted by the server, as browsers may not
 * post to other sites. The address is read from the mail itself with the person's own access, so
 * nobody can make the server post anywhere else; it must be https on the internet (not inside a
 * network), is posted to once, without following redirects.
 */
import { lookup } from "node:dns/promises";
import { Hono } from "hono";
import { z } from "zod";
import type { Grants } from "../auth";
import type { Env } from "../env";
import type { SessionInfo } from "../session-info";
import { isPrivateAddress } from "./private-address";
import { unsubscribeWay } from "./unsubscribe";

const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"];
const TIMEOUT_MS = 10_000;

const request = z.object({
  accountId: z.string().min(1).max(64),
  emailId: z.string().min(1).max(200),
});

export type UnsubscribeDeps = {
  env: Pick<Env, "STALWART_URL" | "UNSUBSCRIBE_ANY_TARGET">;
  grants: Pick<Grants, "accessToken">;
  infoOf: (request: Request) => Promise<SessionInfo | null>;
  /** Looks up a host's addresses; the internet's DNS unless a test says otherwise. */
  resolve?: (host: string) => Promise<string[]>;
};

/** Whether the server may post to this address. */
const allowed = async (
  url: URL,
  anyTarget: boolean,
  resolve: (host: string) => Promise<string[]>,
) => {
  if (anyTarget) return true;
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await resolve(host).catch(() => []);
  return addresses.length > 0 && !addresses.some(isPrivateAddress);
};

export const createUnsubscribeRoutes = ({
  env,
  grants,
  infoOf,
  resolve = async (host) => (await lookup(host, { all: true })).map((entry) => entry.address),
}: UnsubscribeDeps) => {
  const app = new Hono();

  app.post("/", async (c) => {
    const info = await infoOf(c.req.raw);
    if (!info) return c.json({ error: "Nicht angemeldet" }, 401);
    const parsed = request.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const { accountId, emailId } = parsed.data;
    if (!info.accounts.some((account) => account.id === accountId)) {
      return c.json({ error: "Unbekannte Mail" }, 404);
    }
    const token = await grants.accessToken(info.sessionId);
    if (!token) return c.json({ error: "Nicht angemeldet" }, 401);

    // The headers as the mail has them, read with the person's own access.
    const auth = { authorization: `Bearer ${token}` };
    const session = (await (
      await fetch(`${env.STALWART_URL}/jmap/session`, { headers: auth })
    ).json()) as { apiUrl: string };
    const api = new URL(session.apiUrl);
    const answer = await fetch(`${env.STALWART_URL}${api.pathname}`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        using: USING,
        methodCalls: [
          [
            "Email/get",
            {
              accountId,
              ids: [emailId],
              properties: ["header:List-Unsubscribe:asURLs", "header:List-Unsubscribe-Post:asText"],
            },
            "g",
          ],
        ],
      }),
    });
    const { methodResponses } = (await answer.json()) as {
      methodResponses: [string, { list?: Record<string, unknown>[] }][];
    };
    const mail = methodResponses[0]?.[1].list?.[0];
    if (!mail) return c.json({ error: "Unbekannte Mail" }, 404);
    const way = unsubscribeWay(
      mail["header:List-Unsubscribe:asURLs"] as string[] | null,
      mail["header:List-Unsubscribe-Post:asText"] as string | null,
    );
    if (way?.kind !== "one-click") {
      return c.json({ error: "Diese Mail lässt sich nicht mit einem Klick abbestellen." }, 400);
    }
    const target = new URL(way.url);
    if (!(await allowed(target, env.UNSUBSCRIBE_ANY_TARGET, resolve))) {
      return c.json({ error: "Diese Abmelde-Adresse ruft Kontext nicht auf." }, 400);
    }
    const response = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "List-Unsubscribe=One-Click",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Tests only: the stand-in list server has a certificate of its own making.
      ...(env.UNSUBSCRIBE_ANY_TARGET ? { tls: { rejectUnauthorized: false } } : {}),
    }).catch(() => null);
    if (!response || response.status >= 400) {
      return c.json(
        {
          error: `Der Absender hat die Abmeldung nicht angenommen (${response?.status ?? "keine Antwort"}).`,
        },
        502,
      );
    }
    return c.json({ ok: true });
  });

  return app;
};
