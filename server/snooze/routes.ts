/**
 * /api/snoozes: the Wiedervorlagen of a mailbox, for everyone who can open it (in info@ the team
 * sees when a mail comes back); who may write in it puts mails away and takes them out again.
 */
import { Hono } from "hono";
import type { SessionInfo } from "../session-info";
import { snoozeSchema, unsnoozeSchema, validUntil } from "./snooze";
import type { SnoozeStore } from "./store";

export type SnoozeDeps = {
  store: SnoozeStore;
  infoOf: (request: Request) => Promise<SessionInfo | null>;
  now?: () => Date;
};

export const createSnoozeRoutes = ({ store, infoOf, now = () => new Date() }: SnoozeDeps) => {
  const app = new Hono<{ Variables: { info: SessionInfo } }>();
  app.use(async (c, next) => {
    const info = await infoOf(c.req.raw);
    if (!info) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("info", info);
    await next();
  });
  const account = (info: SessionInfo, id: string) =>
    info.accounts.find((candidate) => candidate.id === id);

  app.get("/", async (c) => {
    const accountId = c.req.query("accountId") ?? "";
    if (!account(c.get("info"), accountId)) return c.json({ snoozes: [] });
    return c.json({ snoozes: await store.list(accountId) });
  });

  app.put("/", async (c) => {
    const parsed = snoozeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const { accountId, emailIds, until } = parsed.data;
    const info = c.get("info");
    const target = account(info, accountId);
    if (!target || target.isReadOnly) {
      return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    }
    if (!validUntil(new Date(until), now())) {
      return c.json({ error: "Der Zeitpunkt liegt nicht in der Zukunft." }, 400);
    }
    const userId = await store.userOf(info.sessionId);
    if (!userId) return c.json({ error: "Nicht angemeldet" }, 401);
    const by = info.accounts.find((candidate) => candidate.isPersonal)?.id ?? "";
    await store.put(
      emailIds.map((emailId) => ({ accountId, emailId, until, by })),
      userId,
    );
    return c.json({ ok: true });
  });

  app.post("/remove", async (c) => {
    const parsed = unsnoozeSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const target = account(c.get("info"), parsed.data.accountId);
    if (!target || target.isReadOnly) {
      return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    }
    await store.remove(parsed.data.accountId, parsed.data.emailIds);
    return c.json({ ok: true });
  });

  return app;
};
