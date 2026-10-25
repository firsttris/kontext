/**
 * /api/tasks: the tasks of every account the signed-in person can open (their own mailbox and
 * shared ones), and changing them. Who may open which account is Stalwart's JMAP session of that
 * person; every member of a shared mailbox may create, change and delete its tasks, someone who
 * may only read it may only look. Whom a task is given to sees and changes it too, also on a
 * colleague's own board.
 */
import { Hono } from "hono";
import type { SessionAccount } from "../categories/routes";
import type { Notice } from "../push/pusher";
import { assignedNotice } from "./notices";
import type { TaskStore } from "./store";
import { newTaskSchema, type Task, taskPatchSchema } from "./tasks";

export type TaskDeps = {
  store: TaskStore;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
  now?: () => Date;
  /** Told after every change, with the account (board) it touched and its assignees. */
  changed?: (accountId: string, assignees: string[]) => void;
  /** Pushes to people (personal account ids): a task given to someone else is told to them. */
  notify?: (memberIds: string[], notice: Notice) => Promise<void>;
  nameOf?: (request: Request) => Promise<string>;
};

/** Finished tasks stay in the lists this long. */
const DONE_DAYS = 30;

export const createTaskRoutes = ({
  store,
  accountsOf,
  now = () => new Date(),
  changed = () => undefined,
  notify = async () => undefined,
  nameOf = async () => "",
}: TaskDeps) => {
  const app = new Hono();
  const writable = (accounts: SessionAccount[], id: string) =>
    accounts.some((account) => account.id === id && !account.isReadOnly);
  const personal = (accounts: SessionAccount[]) =>
    accounts.find((account) => account.isPersonal)?.id;
  const assignedToMe = (accounts: SessionAccount[], task: Task) =>
    task.assigneeId !== null && task.assigneeId === personal(accounts);
  const visible = (accounts: SessionAccount[], task: Task) =>
    accounts.some((account) => account.id === task.accountId) || assignedToMe(accounts, task);
  const told = (task: Task, ...more: (string | null)[]) =>
    [task.assigneeId, ...more].filter((id): id is string => Boolean(id));

  /** Given to someone else just now: they hear of it; the push must not hold up the answer. */
  const tellAssignee = async (request: Request, task: Task, me: string | undefined) => {
    if (!task.assigneeId || task.assigneeId === me) return;
    const notice = assignedNotice(task, await nameOf(request).catch(() => ""));
    void notify([task.assigneeId], notice).catch(() => undefined);
  };

  app.get("/", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const since = new Date(now().getTime() - DONE_DAYS * 86_400_000);
    return c.json({
      tasks: await store.list(
        accounts.map((account) => account.id),
        since,
        personal(accounts),
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
    const me = personal(accounts) ?? parsed.data.accountId;
    const created = await store.create(parsed.data, me);
    changed(created.accountId, told(created));
    await tellAssignee(c.req.raw, created, me);
    return c.json({ task: created }, 201);
  });

  app.patch("/:id", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const task = await store.get(c.req.param("id"));
    if (!task || !visible(accounts, task)) {
      return c.json({ error: "Unbekannte Aufgabe" }, 404);
    }
    const parsed = taskPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const target = parsed.data.accountId ?? task.accountId;
    // Whom it is given to may change it where it is; onto another board only who may write both.
    const mayChange =
      target === task.accountId
        ? writable(accounts, task.accountId) || assignedToMe(accounts, task)
        : writable(accounts, task.accountId) && writable(accounts, target);
    if (!mayChange) {
      return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    }
    const me = personal(accounts) ?? task.accountId;
    const before = task.assigneeId;
    const updated = await store.update(task.id, parsed.data, me);
    const assignees = told(task, updated?.assigneeId ?? null);
    changed(task.accountId, assignees);
    if (target !== task.accountId) changed(target, assignees);
    if (updated && updated.assigneeId !== before) {
      await tellAssignee(c.req.raw, updated, me);
    }
    return c.json({ task: updated });
  });

  app.delete("/:id", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const task = await store.get(c.req.param("id"));
    if (!task || !visible(accounts, task)) {
      return c.json({ error: "Unbekannte Aufgabe" }, 404);
    }
    if (!writable(accounts, task.accountId)) {
      return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    }
    await store.remove(task.id);
    changed(task.accountId, told(task));
    return c.json({ ok: true });
  });

  return app;
};
