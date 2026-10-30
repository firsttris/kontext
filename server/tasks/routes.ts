/**
 * /api/tasks: the tasks of every account the signed-in person can open (their own mailbox and
 * shared ones), and changing them. Who may open which account is Stalwart's JMAP session of that
 * person; every member of a shared mailbox may create, change and delete its tasks, someone who
 * may only read it may only look. Whom a task is given to sees and changes it too, also on a
 * colleague's own board. Besides its own board, an account has projects: further boards, made,
 * renamed and removed by whoever may write the account.
 */
import { Hono } from "hono";
import type { SessionAccount } from "../categories/routes";
import type { Notice } from "../push/pusher";
import { assignedNotice } from "./notices";
import type { Board, TaskStore } from "./store";
import {
  boardKey,
  columnsSchema,
  companyDay,
  newProjectSchema,
  newTaskSchema,
  nextOccurrence,
  projectNameSchema,
  type Task,
  taskPatchSchema,
} from "./tasks";

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
/** Projects per account; more is a list nobody finds their way through. */
const MAX_PROJECTS = 50;

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

  /** Whether a board has this column. */
  const hasColumn = async (board: Board, status: string) => {
    const key = boardKey(board);
    return ((await store.columns([key]))[key] ?? []).some((column) => column.id === status);
  };

  /** A project by its id, and only if it belongs to this account. */
  const projectOf = async (accountId: string, id: string) =>
    (await store.projects([], [id])).find((project) => project.accountId === accountId);

  /** A board given by its key: an account one may write, or a project of one. */
  const writableBoard = async (accounts: SessionAccount[], key: string) => {
    if (writable(accounts, key)) return { accountId: key, projectId: null };
    const [project] = await store.projects([], [key]);
    return project && writable(accounts, project.accountId)
      ? { accountId: project.accountId, projectId: project.id }
      : null;
  };

  app.get("/", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const since = new Date(now().getTime() - DONE_DAYS * 86_400_000);
    const tasks = await store.list(
      accounts.map((account) => account.id),
      since,
      personal(accounts),
    );
    // The projects of one's accounts, and those a task given to one lies on.
    const projects = await store.projects(
      accounts.map((account) => account.id),
      tasks.flatMap((task) => (task.projectId ? [task.projectId] : [])),
    );
    // The columns of every board one has or sees a task of.
    const keys = [
      ...new Set([
        ...accounts.map((account) => account.id),
        ...projects.map((project) => project.id),
        ...tasks.map(boardKey),
      ]),
    ];
    return c.json({ tasks, projects, boards: await store.columns(keys) });
  });

  /** A board's own columns: renamed, added, removed, in another order. */
  app.put("/boards/:key", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const board = await writableBoard(accounts, c.req.param("key"));
    if (!board) return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    const parsed = columnsSchema.safeParse((await c.req.json().catch(() => null))?.columns);
    if (!parsed.success) return c.json({ error: "Die Spalten passen nicht." }, 400);
    await store.setColumns(board, parsed.data);
    changed(board.accountId, []);
    return c.json({ columns: parsed.data });
  });

  app.post("/projects", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const parsed = newProjectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Das Board braucht einen Namen." }, 400);
    const { accountId, name } = parsed.data;
    if (!writable(accounts, accountId)) {
      return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    }
    if ((await store.projects([accountId])).length >= MAX_PROJECTS) {
      return c.json({ error: `Höchstens ${MAX_PROJECTS} Boards je Postfach.` }, 400);
    }
    const project = await store.createProject(accountId, name);
    changed(accountId, []);
    return c.json({ project }, 201);
  });

  app.patch("/projects/:id", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const board = await writableBoard(accounts, c.req.param("id"));
    if (!board?.projectId) return c.json({ error: "Unbekanntes Board" }, 404);
    const name = projectNameSchema.safeParse((await c.req.json().catch(() => null))?.name);
    if (!name.success) return c.json({ error: "Das Board braucht einen Namen." }, 400);
    await store.renameProject(board.projectId, name.data);
    changed(board.accountId, []);
    return c.json({ ok: true });
  });

  /** The project goes; its tasks stay, on the account's own board. */
  app.delete("/projects/:id", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const board = await writableBoard(accounts, c.req.param("id"));
    if (!board?.projectId) return c.json({ error: "Unbekanntes Board" }, 404);
    const assignees = (await store.list([board.accountId], new Date(0)))
      .filter((task) => task.projectId === board.projectId)
      .flatMap((task) => told(task));
    await store.removeProject(board.projectId);
    changed(board.accountId, [...new Set(assignees)]);
    return c.json({ ok: true });
  });

  app.post("/", async (c) => {
    const accounts = await accountsOf(c.req.raw);
    if (!accounts) return c.json({ error: "Nicht angemeldet" }, 401);
    const parsed = newTaskSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    if (!writable(accounts, parsed.data.accountId)) {
      return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    }
    const { projectId } = parsed.data;
    if (projectId && !(await projectOf(parsed.data.accountId, projectId))) {
      return c.json({ error: "Dieses Board gibt es nicht." }, 400);
    }
    if (!(await hasColumn(parsed.data, parsed.data.status))) {
      return c.json({ error: "Diese Spalte gibt es nicht." }, 400);
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
    // Onto another account without a project named: onto that account's own board.
    const projectId =
      parsed.data.projectId !== undefined
        ? parsed.data.projectId
        : target === task.accountId
          ? task.projectId
          : null;
    const board = { accountId: target, projectId };
    // Account and project both: a project's key alone would hide a change of account.
    const moved = target !== task.accountId || projectId !== task.projectId;
    // Whom it is given to may change it where it is; onto another board only who may write both.
    const mayChange = moved
      ? writable(accounts, task.accountId) && writable(accounts, target)
      : writable(accounts, task.accountId) || assignedToMe(accounts, task);
    if (!mayChange) {
      return c.json({ error: "Dieses Postfach ist nur zum Lesen." }, 403);
    }
    if (projectId && moved && !(await projectOf(target, projectId))) {
      return c.json({ error: "Dieses Board gibt es nicht." }, 400);
    }
    const patch = { ...parsed.data, ...(moved ? { projectId } : {}) };
    if (patch.status && !(await hasColumn(board, patch.status))) {
      return c.json({ error: "Diese Spalte gibt es nicht." }, 400);
    }
    // Onto a board without its column: into "open" there.
    if (!patch.status && moved && !(await hasColumn(board, task.status))) {
      patch.status = "open";
    }
    const me = personal(accounts) ?? task.accountId;
    const before = task.assigneeId;
    const wasDone = task.status === "done";
    let updated = await store.update(task.id, patch, me);
    // A repeating task done: the next one is there at once, this one repeats no more.
    if (updated && updated.status === "done" && !wasDone && updated.repeat) {
      const next = nextOccurrence(updated, companyDay(now()));
      if (next) await store.create(next, updated.createdBy);
      updated = await store.update(updated.id, { repeat: null }, me);
    }
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
