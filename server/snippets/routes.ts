/**
 * /api/snippets: the snippets of every account the person can open; who may write in an account
 * (not only read it) adds, changes and removes its snippets – in info@ the whole team.
 */
import { Hono } from "hono";
import type { SessionAccount } from "../categories/routes";
import { snippetPatchSchema, snippetSchema } from "./snippets";
import type { SnippetStore } from "./store";

export type SnippetDeps = {
  store: SnippetStore;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
};

export const createSnippetRoutes = ({ store, accountsOf }: SnippetDeps) => {
  const app = new Hono<{ Variables: { accounts: SessionAccount[] } }>();
  app.use(async (c, next) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("accounts", accounts);
    await next();
  });
  const writable = (accounts: SessionAccount[], id: string) =>
    accounts.some((account) => account.id === id && !account.isReadOnly);
  const me = (accounts: SessionAccount[]) =>
    accounts.find((account) => account.isPersonal)?.id ?? "";

  app.get("/", async (c) =>
    c.json({ snippets: await store.list(c.get("accounts").map((account) => account.id)) }),
  );

  app.post("/", async (c) => {
    const parsed = snippetSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Titel und Text fehlen." }, 400);
    const accounts = c.get("accounts");
    if (!writable(accounts, parsed.data.accountId)) {
      return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    }
    return c.json({ snippet: await store.create(parsed.data, me(accounts)) }, 201);
  });

  const own = async (id: string, accounts: SessionAccount[]) => {
    const snippet = await store.get(id);
    return snippet && writable(accounts, snippet.accountId) ? snippet : null;
  };

  app.patch("/:id", async (c) => {
    const snippet = await own(c.req.param("id"), c.get("accounts"));
    if (!snippet) return c.json({ error: "Unbekannter Textbaustein" }, 404);
    const parsed = snippetPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    return c.json({ snippet: await store.update(snippet.id, parsed.data) });
  });

  app.delete("/:id", async (c) => {
    const snippet = await own(c.req.param("id"), c.get("accounts"));
    if (!snippet) return c.json({ error: "Unbekannter Textbaustein" }, 404);
    await store.remove(snippet.id);
    return c.json({ ok: true });
  });

  return app;
};
