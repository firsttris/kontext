/** Tasks in Kontext's SQLite: one row per task, its links to mails, contacts and appointments. */
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  max,
  ne,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import {
  type BoardColumn,
  type CheckItem,
  DEFAULT_COLUMNS,
  type NewTaskData,
  type Repeat,
  type Task,
  type TaskLink,
  type TaskPatch,
  type TaskProject,
} from "./tasks";

/** A board: an account's own (`projectId` null) or one of its projects. */
export type Board = { accountId: string; projectId: string | null };

export type TaskStore = {
  /**
   * Open tasks of these accounts and those assigned to `me` wherever they are (a colleague's own
   * board), and the ones finished since `doneSince`.
   */
  list: (accountIds: string[], doneSince: Date, me?: string) => Promise<Task[]>;
  get: (id: string) => Promise<Task | null>;
  create: (task: NewTaskData, createdBy: string) => Promise<Task>;
  /** `by`: who changes it, kept as who assigned it when the assignee changes. */
  update: (id: string, patch: TaskPatch, by: string) => Promise<Task | null>;
  remove: (id: string) => Promise<void>;
  /** Open tasks whose reminder is due and not yet sent, the oldest first. */
  dueReminders: (now: Date) => Promise<Task[]>;
  markReminded: (id: string, at: Date) => Promise<void>;
  /**
   * The columns of these boards, by board key (an account id or a project id, `boardKey`);
   * built-in ones where a board has none of its own.
   */
  columns: (keys: string[]) => Promise<Record<string, BoardColumn[]>>;
  /** New columns; tasks in a column that went move to the end of "open". */
  setColumns: (board: Board, columns: BoardColumn[]) => Promise<void>;
  /** The projects of these accounts and those with these ids, the oldest first. */
  projects: (accountIds: string[], ids?: string[]) => Promise<TaskProject[]>;
  createProject: (accountId: string, name: string) => Promise<TaskProject>;
  renameProject: (id: string, name: string) => Promise<void>;
  /** Gone; its tasks move to the end of "open" on the account's own board. */
  removeProject: (id: string) => Promise<void>;
  /** A board's tasks for CalDAV, with their file name and UID there. */
  davList: (board: Board, doneSince: Date) => Promise<DavTask[]>;
  /** The task a CalDAV client means by this file name. */
  davGet: (board: Board, name: string) => Promise<DavTask | null>;
  /** A task a CalDAV client made, under its file name and UID. */
  davCreate: (task: NewTaskData, createdBy: string, name: string, uid: string) => Promise<Task>;
};

export type DavTask = { task: Task; name: string; uid: string };

type Row = typeof schema.tasks.$inferSelect;
type LinkRow = typeof schema.taskLinks.$inferSelect;

const toTask = (row: Row, links: LinkRow[]): Task => ({
  id: row.id,
  accountId: row.accountId,
  projectId: row.projectId,
  title: row.title,
  notes: row.notes,
  status: row.status,
  position: row.position,
  assigneeId: row.assigneeId,
  dueDate: row.dueDate,
  dueTime: row.dueTime,
  checklist: JSON.parse(row.checklist) as CheckItem[],
  links: links.map(({ kind, accountId, ref, threadId, label, detail }) => ({
    kind: kind as TaskLink["kind"],
    accountId,
    ref,
    threadId,
    label,
    detail,
  })),
  createdBy: row.createdBy,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  completedAt: row.completedAt?.toISOString() ?? null,
  assignedBy: row.assignedBy,
  assignedAt: row.assignedAt?.toISOString() ?? null,
  remindAt: row.remindAt?.toISOString() ?? null,
  repeat: (row.repeat as Repeat | null) ?? null,
});

const instant = (value: string | null) => (value ? new Date(value) : null);

/** The tasks on a board: its project's, or the account's without a project. */
const onBoard = ({ accountId, projectId }: Board): SQL =>
  and(
    eq(schema.tasks.accountId, accountId),
    projectId ? eq(schema.tasks.projectId, projectId) : isNull(schema.tasks.projectId),
  )!;

const toProject = (row: typeof schema.taskProjects.$inferSelect): TaskProject => ({
  id: row.id,
  accountId: row.accountId,
  name: row.name,
});

const davOf = (row: Row, task: Task): DavTask => ({
  task,
  name: row.davName ?? row.id,
  uid: row.davUid ?? row.id,
});

export const createTaskStore = (db: Db): TaskStore => {
  const linksOf = async (ids: string[]) => {
    if (!ids.length) return new Map<string, LinkRow[]>();
    const rows = await db
      .select()
      .from(schema.taskLinks)
      .where(inArray(schema.taskLinks.taskId, ids));
    const byTask = new Map<string, LinkRow[]>();
    for (const row of rows) byTask.set(row.taskId, [...(byTask.get(row.taskId) ?? []), row]);
    return byTask;
  };

  const get = async (id: string) => {
    const [row] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    return row ? toTask(row, (await linksOf([id])).get(id) ?? []) : null;
  };

  /** After the last task of the column, so a new one goes to the end. */
  const nextPosition = async (board: Board, status: string) => {
    const [row] = await db
      .select({ last: max(schema.tasks.position) })
      .from(schema.tasks)
      .where(and(onBoard(board), eq(schema.tasks.status, status)));
    return (row?.last ?? 0) + 1;
  };

  /** Tasks on a board outside these columns: to the end of "open". */
  const reopenOutside = async (board: Board, kept: string[]) => {
    const orphans = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(onBoard(board), notInArray(schema.tasks.status, kept)));
    let position = await nextPosition(board, "open");
    for (const { id } of orphans) {
      await db
        .update(schema.tasks)
        .set({ status: "open", position: position++, updatedAt: new Date() })
        .where(eq(schema.tasks.id, id));
    }
  };

  const writeLinks = async (taskId: string, links: TaskLink[]) => {
    await db.delete(schema.taskLinks).where(eq(schema.taskLinks.taskId, taskId));
    if (links.length) {
      await db
        .insert(schema.taskLinks)
        .values(links.map((link) => ({ ...link, taskId, threadId: link.threadId ?? null })))
        .onConflictDoNothing();
    }
  };

  const create = async (task: NewTaskData, createdBy: string): Promise<Task> => {
    const id = crypto.randomUUID();
    const now = new Date();
    await db.insert(schema.tasks).values({
      id,
      accountId: task.accountId,
      projectId: task.projectId,
      title: task.title,
      notes: task.notes,
      status: task.status,
      position: task.position ?? (await nextPosition(task, task.status)),
      assigneeId: task.assigneeId,
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      checklist: JSON.stringify(task.checklist),
      createdBy,
      completedAt: task.status === "done" ? now : null,
      assignedBy: task.assigneeId ? createdBy : null,
      assignedAt: task.assigneeId ? now : null,
      remindAt: instant(task.remindAt),
      repeat: task.repeat,
      createdAt: now,
      updatedAt: now,
    });
    await writeLinks(id, task.links);
    return (await get(id))!;
  };

  const store: TaskStore = {
    list: async (accountIds, doneSince, me) => {
      if (!accountIds.length && !me) return [];
      const rows = await db
        .select()
        .from(schema.tasks)
        .where(
          and(
            or(
              inArray(schema.tasks.accountId, accountIds),
              me ? eq(schema.tasks.assigneeId, me) : undefined,
            ),
            or(
              ne(schema.tasks.status, "done"),
              isNull(schema.tasks.completedAt),
              gte(schema.tasks.completedAt, doneSince),
            ),
          ),
        );
      const links = await linksOf(rows.map((row) => row.id));
      return rows.map((row) => toTask(row, links.get(row.id) ?? []));
    },
    get,
    create,
    update: async (id, patch, by) => {
      const current = await get(id);
      if (!current) return null;
      const { links, checklist, remindAt, ...rest } = patch;
      const reassigned = patch.assigneeId !== undefined && patch.assigneeId !== current.assigneeId;
      const status = patch.status ?? current.status;
      const board = {
        accountId: patch.accountId ?? current.accountId,
        projectId: patch.projectId !== undefined ? patch.projectId : current.projectId,
      };
      const moved =
        (patch.status && patch.status !== current.status) ||
        board.accountId !== current.accountId ||
        board.projectId !== current.projectId;
      await db
        .update(schema.tasks)
        .set({
          ...rest,
          ...(checklist ? { checklist: JSON.stringify(checklist) } : {}),
          ...(reassigned
            ? {
                assignedBy: patch.assigneeId ? by : null,
                assignedAt: patch.assigneeId ? new Date() : null,
              }
            : {}),
          // A new time reminds anew.
          ...(remindAt !== undefined && remindAt !== current.remindAt
            ? { remindAt: instant(remindAt), remindedAt: null }
            : {}),
          // Into another column without a place of its own: at its end.
          ...(moved && patch.position === undefined
            ? { position: await nextPosition(board, status) }
            : {}),
          ...(patch.status
            ? {
                completedAt:
                  patch.status === "done"
                    ? current.completedAt
                      ? new Date(current.completedAt)
                      : new Date()
                    : null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(schema.tasks.id, id));
      if (links) await writeLinks(id, links);
      return get(id);
    },
    remove: async (id) => {
      await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
    },
    dueReminders: async (now) => {
      const rows = await db
        .select()
        .from(schema.tasks)
        .where(
          and(
            lte(schema.tasks.remindAt, now),
            isNull(schema.tasks.remindedAt),
            ne(schema.tasks.status, "done"),
          ),
        )
        .orderBy(asc(schema.tasks.remindAt));
      const links = await linksOf(rows.map((row) => row.id));
      return rows.map((row) => toTask(row, links.get(row.id) ?? []));
    },
    markReminded: async (id, at) => {
      await db.update(schema.tasks).set({ remindedAt: at }).where(eq(schema.tasks.id, id));
    },
    davList: async (board, doneSince) => {
      const rows = await db
        .select()
        .from(schema.tasks)
        .where(
          and(
            onBoard(board),
            or(
              ne(schema.tasks.status, "done"),
              isNull(schema.tasks.completedAt),
              gte(schema.tasks.completedAt, doneSince),
            ),
          ),
        );
      const links = await linksOf(rows.map((row) => row.id));
      return rows.map((row) => davOf(row, toTask(row, links.get(row.id) ?? [])));
    },
    davGet: async (board, name) => {
      const [row] = await db
        .select()
        .from(schema.tasks)
        .where(
          and(
            onBoard(board),
            or(
              eq(schema.tasks.davName, name),
              and(isNull(schema.tasks.davName), eq(schema.tasks.id, name)),
            ),
          ),
        );
      return row ? davOf(row, toTask(row, (await linksOf([row.id])).get(row.id) ?? [])) : null;
    },
    davCreate: async (task, createdBy, name, uid) => {
      const created = await create(task, createdBy);
      await db
        .update(schema.tasks)
        .set({ davName: name, davUid: uid })
        .where(eq(schema.tasks.id, created.id));
      return created;
    },
    columns: async (keys) => {
      const [boards, projects] = keys.length
        ? await Promise.all([
            db.select().from(schema.taskBoards).where(inArray(schema.taskBoards.accountId, keys)),
            db.select().from(schema.taskProjects).where(inArray(schema.taskProjects.id, keys)),
          ])
        : [[], []];
      const own = new Map<string, string | null>([
        ...boards.map((row) => [row.accountId, row.columns] as const),
        ...projects.map((row) => [row.id, row.columns] as const),
      ]);
      return Object.fromEntries(
        keys.map((key) => {
          const columns = own.get(key);
          return [key, columns ? (JSON.parse(columns) as BoardColumn[]) : DEFAULT_COLUMNS];
        }),
      );
    },
    setColumns: async (board, columns) => {
      const json = JSON.stringify(columns);
      const updatedAt = new Date();
      if (board.projectId) {
        await db
          .update(schema.taskProjects)
          .set({ columns: json, updatedAt })
          .where(eq(schema.taskProjects.id, board.projectId));
      } else {
        const row = { accountId: board.accountId, columns: json, updatedAt };
        await db
          .insert(schema.taskBoards)
          .values(row)
          .onConflictDoUpdate({ target: schema.taskBoards.accountId, set: row });
      }
      await reopenOutside(
        board,
        columns.map((column) => column.id),
      );
    },
    projects: async (accountIds, ids = []) => {
      if (!accountIds.length && !ids.length) return [];
      const rows = await db
        .select()
        .from(schema.taskProjects)
        .where(
          or(
            inArray(schema.taskProjects.accountId, accountIds),
            inArray(schema.taskProjects.id, ids),
          ),
        )
        .orderBy(asc(schema.taskProjects.createdAt));
      return rows.map(toProject);
    },
    createProject: async (accountId, name) => {
      const now = new Date();
      const row = {
        id: `p-${crypto.randomUUID()}`,
        accountId,
        name,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.taskProjects).values(row);
      return toProject({ ...row, columns: null });
    },
    renameProject: async (id, name) => {
      await db
        .update(schema.taskProjects)
        .set({ name, updatedAt: new Date() })
        .where(eq(schema.taskProjects.id, id));
    },
    removeProject: async (id) => {
      const [project] = await db
        .select()
        .from(schema.taskProjects)
        .where(eq(schema.taskProjects.id, id));
      if (!project) return;
      const to = { accountId: project.accountId, projectId: null };
      // In the same column there, else in "open"; at its end either way.
      const kept = ((await store.columns([project.accountId]))[project.accountId] ?? []).map(
        (column) => column.id,
      );
      const moving = await db
        .select()
        .from(schema.tasks)
        .where(onBoard({ accountId: project.accountId, projectId: id }))
        .orderBy(asc(schema.tasks.position));
      for (const task of moving) {
        const status = kept.includes(task.status) ? task.status : "open";
        await db
          .update(schema.tasks)
          .set({
            projectId: null,
            status,
            position: await nextPosition(to, status),
            updatedAt: new Date(),
          })
          .where(eq(schema.tasks.id, task.id));
      }
      await db.delete(schema.taskProjects).where(eq(schema.taskProjects.id, id));
    },
  };
  return store;
};
