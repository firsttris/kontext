/**
 * /api/tasks: the tasks of every account the signed-in person can open (their own mailbox and
 * shared ones), and changing them. Who may open which account is Stalwart's JMAP session of that
 * person; every member of a shared mailbox may create, change and delete its tasks, someone who
 * may only read it may only look.
 */
import { Hono } from "hono";
import type { SessionAccount } from "../categories/routes";
import type { TaskStore } from "./store";
import { newTaskSchema, taskPatchSchema } from "./tasks";

export type TaskDeps = {
  store: TaskStore;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
  now?: () => Date;
};

/** Finished tasks stay in the lists this long. */
const DONE_DAYS = 30;

export const createTaskRoutes = ({ store, accountsOf, now = () => new Date() }: TaskDeps) => {
  const app = new Hono();
  const writable = (accounts: SessionAccount[], id: string) =>
    accounts.some((account) => account.id === id && !account.isReadOnly);

  app.get("/", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const since = new Date(now().getTime() - DONE_DAYS * 86_400_000);
    return c.json({
      tasks: await store.list(
        accounts.map((account) => account.id),
        since,
      ),
    });
  });

  app.post("/", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const parsed = newTaskSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    if (!writable(accounts, parsed.data.accountId)) {
      return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    }
    const me = accounts.find((account) => account.isPersonal)?.id ?? parsed.data.accountId;
    return c.json({ task: await store.create(parsed.data, me) }, 201);
  });

  app.patch("/:id", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const task = await store.get(c.req.param("id"));
    if (!task || !accounts.some((account) => account.id === task.accountId)) {
      return c.json({ error: "Unbekannte Aufgabe" }, 404);
    }
    const parsed = taskPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const target = parsed.data.accountId ?? task.accountId;
    if (!writable(accounts, task.accountId) || !writable(accounts, target)) {
      return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    }
    return c.json({ task: await store.update(task.id, parsed.data) });
  });

  app.delete("/:id", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const task = await store.get(c.req.param("id"));
    if (!task || !accounts.some((account) => account.id === task.accountId)) {
      return c.json({ error: "Unbekannte Aufgabe" }, 404);
    }
    if (!writable(accounts, task.accountId)) {
      return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    }
    await store.remove(task.id);
    return c.json({ ok: true });
  });

  return app;
};
