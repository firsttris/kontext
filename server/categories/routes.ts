/**
 * /api/categories: the categories of every mail account the signed-in person can open, and
 * changing those of one. Who may open which account is Stalwart's JMAP session of that person;
 * read-only accounts can be looked at, not changed.
 */
import { Hono } from "hono";
import { z } from "zod";
import { categoriesSchema } from "./categories";
import type { CategoryStore } from "./store";

export type SessionAccount = { id: string; isReadOnly: boolean; isPersonal: boolean };

export type CategoryDeps = {
  store: CategoryStore;
  /** The accounts in the person's JMAP session, or null when nobody is signed in. */
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
};

const body = z.object({ categories: categoriesSchema });

export const createCategoryRoutes = ({ store, accountsOf }: CategoryDeps) => {
  const app = new Hono();

  app.get("/", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    return c.json(await store.list(accounts.map((account) => account.id)));
  });

  app.put("/:accountId", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const account = accounts.find((candidate) => candidate.id === c.req.param("accountId"));
    if (!account) return c.json({ error: "Unbekanntes Postfach" }, 404);
    if (account.isReadOnly) return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    const parsed = body.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    await store.save(account.id, parsed.data.categories);
    return c.json({ ok: true });
  });

  return app;
};
