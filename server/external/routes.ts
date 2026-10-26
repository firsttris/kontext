/**
 * /api/external-accounts: a person's other mailboxes (Gmail, GMX, …), for themselves only – list,
 * connect (both servers are checked at once), new password, fetch now, remove, and send a saved
 * draft through the provider. The accounts belong to the person's own Stalwart account.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Sealer } from "../crypto";
import { NOT_ON_INTERNET } from "../internet-host";
import { openImap } from "../migration/imap-source";
import type { SessionInfo } from "../session-info";
import type { Fetcher } from "./fetcher";
import { type MailProviderId, serversFor } from "./providers";
import { sendThrough } from "./send";
import type { Smtp } from "./smtp";
import type { ExternalAccount, ExternalStore } from "./store";
import type { UserJmap } from "./user-jmap";

export type ExternalDeps = {
  store: ExternalStore;
  fetcher: Fetcher;
  sealer: Sealer;
  smtp: Smtp;
  infoOf: (request: Request) => Promise<SessionInfo | null>;
  jmapFor: (sessionId: string) => Promise<UserJmap | null>;
  /** Tests against a local server: any port, no TLS, inside the network. */
  allowPlain?: boolean;
};

const providers = [
  "gmail",
  "gmx",
  "webde",
  "t-online",
  "ionos",
  "strato",
  "1und1",
  "other",
] as const satisfies readonly MailProviderId[];

const port = z.number().int().positive().max(65535).optional();
const newAccount = z.object({
  provider: z.enum(providers),
  email: z.email().max(320),
  name: z.string().trim().max(200).default(""),
  /** The login at the provider when it is not the address. */
  login: z.string().trim().max(320).optional(),
  password: z.string().min(1).max(1024),
  imapHost: z.string().max(255).optional(),
  imapPort: port,
  smtpHost: z.string().max(255).optional(),
  smtpPort: port,
  target: z.enum(["inbox", "folder"]).default("inbox"),
  /** Also take over what is in the provider's inbox now, not only what comes from now on. */
  importExisting: z.boolean().default(false),
});
const changes = z.object({
  name: z.string().trim().max(200).optional(),
  password: z.string().min(1).max(1024).optional(),
});
const sendRequest = z.object({
  emailId: z.string().min(1).max(200),
  draftsId: z.string().min(1).max(200),
  sentId: z.string().min(1).max(200),
});

/** What the browser sees: everything but the sealed password and the inner state. */
const publicAccount = ({ secret: _, state: __, ...account }: ExternalAccount) => account;

const bad = (error: string) => Response.json({ error }, { status: 400 });

export const createExternalRoutes = ({
  store,
  fetcher,
  sealer,
  smtp,
  infoOf,
  jmapFor,
  allowPlain = false,
}: ExternalDeps) => {
  /** Logs in at both servers; null or the reason in words; the inbox's state for a fresh start. */
  const check = async (
    servers: { imap: { host: string; port: number }; smtp: { host: string; port: number } },
    login: string,
    password: string,
  ) => {
    // Only servers on the internet (openImap and smtp check it): the form must not reach Stalwart
    // or anything else inside.
    const opened = await openImap(servers.imap, { user: login, password }, allowPlain);
    if (!opened.ok) {
      return {
        problem:
          opened.error.reason === "login"
            ? "Anmeldung abgelehnt: Adresse oder (App-)Passwort stimmen nicht, oder IMAP ist beim Anbieter nicht eingeschaltet."
            : opened.error.reason === "outside"
              ? NOT_ON_INTERNET
              : `Der Posteingangsserver antwortet nicht (${opened.error.message}).`,
      };
    }
    let inbox: { uidValidity: string; lastUid: number } | null = null;
    try {
      const listed = await opened.value.newUids("INBOX", 0);
      inbox = { uidValidity: listed.uidValidity, lastUid: listed.uids.at(-1) ?? 0 };
    } finally {
      await opened.value.close();
    }
    const sending = await smtp.check(servers.smtp, { user: login, password });
    if (!sending.ok) {
      return {
        problem:
          sending.error.reason === "login"
            ? "Posteingang geht, aber der Postausgang (SMTP) lehnt die Anmeldung ab."
            : sending.error.reason === "outside"
              ? NOT_ON_INTERNET
              : `Der Postausgangsserver antwortet nicht (${sending.error.message}).`,
      };
    }
    return { problem: null, inbox };
  };

  const app = new Hono();

  /** The caller's own Stalwart account, or an answer to send back. */
  const ownerOf = async (request: Request) => {
    const info = await infoOf(request);
    const own = info?.accounts.find((account) => account.isPersonal);
    return info && own ? { info, accountId: own.id } : null;
  };

  /** One of the caller's accounts. */
  const mine = async (request: Request, id: string) => {
    const owner = await ownerOf(request);
    if (!owner) return null;
    const account = await store.get(id);
    return account?.accountId === owner.accountId ? { owner, account } : null;
  };

  app.get("/", async (c) => {
    const owner = await ownerOf(c.req.raw);
    if (!owner) return c.json({ error: "Nicht angemeldet" }, 401);
    return c.json((await store.listFor(owner.accountId)).map(publicAccount));
  });

  app.post("/", async (c) => {
    const owner = await ownerOf(c.req.raw);
    if (!owner) return c.json({ error: "Nicht angemeldet" }, 401);
    const parsed = newAccount.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return bad("Angaben unvollständig.");
    const body = parsed.data;
    const email = body.email.trim().toLowerCase();
    const existing = await store.listFor(owner.accountId);
    if (existing.some((account) => account.email === email))
      return bad(`${email} ist schon verbunden.`);
    const servers = serversFor(
      body.provider,
      { host: body.imapHost, port: body.imapPort },
      { host: body.smtpHost, port: body.smtpPort },
      allowPlain,
    );
    if (!servers) return bad("Server oder Port ungültig (IMAP: 993 oder 143, SMTP: 465 oder 587).");
    const login = body.login || email;
    const checked = await check(servers, login, body.password);
    if (checked.problem) return bad(checked.problem);
    const account = await store.create({
      accountId: owner.accountId,
      email,
      name: body.name || owner.info.name,
      provider: body.provider,
      imapHost: servers.imap.host,
      imapPort: servers.imap.port,
      smtpHost: servers.smtp.host,
      smtpPort: servers.smtp.port,
      login,
      secret: await sealer.seal(body.password),
      target: body.target,
      // Without the old inbox: start after what is there now.
      state: body.importExisting ? null : (checked.inbox ?? null),
    });
    void fetcher.enqueue(account.id);
    return c.json(publicAccount(account), 201);
  });

  app.patch("/:id", async (c) => {
    const found = await mine(c.req.raw, c.req.param("id"));
    if (!found) return c.json({ error: "Nicht gefunden" }, 404);
    const parsed = changes.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return bad("Angaben unvollständig.");
    const { account } = found;
    const { name, password } = parsed.data;
    if (password) {
      const servers = {
        imap: { host: account.imapHost, port: account.imapPort },
        smtp: { host: account.smtpHost, port: account.smtpPort },
      };
      const checked = await check(servers, account.login, password);
      if (checked.problem) return bad(checked.problem);
    }
    await store.update(account.id, {
      ...(name !== undefined ? { name: name || account.email } : {}),
      ...(password
        ? { secret: await sealer.seal(password), status: "active" as const, lastError: null }
        : {}),
    });
    if (password) void fetcher.enqueue(account.id);
    return c.json({ ok: true });
  });

  app.delete("/:id", async (c) => {
    const owner = await ownerOf(c.req.raw);
    if (!owner) return c.json({ error: "Nicht angemeldet" }, 401);
    const removed = await store.remove(owner.accountId, c.req.param("id"));
    return removed ? c.json({ ok: true }) : c.json({ error: "Nicht gefunden" }, 404);
  });

  app.post("/:id/run", async (c) => {
    const found = await mine(c.req.raw, c.req.param("id"));
    if (!found || found.account.status === "login-failed")
      return c.json({ error: "Nicht gefunden" }, 404);
    void fetcher.enqueue(found.account.id);
    return c.json({ ok: true });
  });

  app.post("/:id/send", async (c) => {
    const found = await mine(c.req.raw, c.req.param("id"));
    if (!found) return c.json({ error: "Nicht gefunden" }, 404);
    const parsed = sendRequest.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return bad("Angaben unvollständig.");
    const jmap = await jmapFor(found.owner.info.sessionId);
    if (!jmap) return c.json({ error: "Nicht angemeldet" }, 401);
    const outcome = await sendThrough({ smtp, sealer, jmap }, found.account, parsed.data);
    return outcome.ok
      ? c.json({ ok: true, refused: outcome.refused })
      : c.json({ error: outcome.error }, outcome.status);
  });

  return app;
};
