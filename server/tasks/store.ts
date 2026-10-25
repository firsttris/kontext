/** Tasks in Kontext's SQLite: one row per task, its links to mails, contacts and appointments. */
import { and, asc, eq, gte, inArray, isNull, lte, max, ne, notInArray, or } from "drizzle-orm";
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
} from "./tasks";

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
  /** The columns of these boards; built-in ones where a board has none of its own. */
  columns: (accountIds: string[]) => Promise<Record<string, BoardColumn[]>>;
  /** New columns; tasks in a column that went move to the end of "open". */
  setColumns: (accountId: string, columns: BoardColumn[]) => Promise<void>;
};

type Row = typeof schema.tasks.$inferSelect;
type LinkRow = typeof schema.taskLinks.$inferSelect;

const toTask = (row: Row, links: LinkRow[]): Task => ({
  id: row.id,
  accountId: row.accountId,
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
  const nextPosition = async (accountId: string, status: string) => {
    const [row] = await db
      .select({ last: max(schema.tasks.position) })
      .from(schema.tasks)
      .where(and(eq(schema.tasks.accountId, accountId), eq(schema.tasks.status, status)));
    return (row?.last ?? 0) + 1;
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

  return {
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
    create: async (task, createdBy) => {
      const id = crypto.randomUUID();
      const now = new Date();
      await db.insert(schema.tasks).values({
        id,
        accountId: task.accountId,
        title: task.title,
        notes: task.notes,
        status: task.status,
        position: task.position ?? (await nextPosition(task.accountId, task.status)),
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
    },
    update: async (id, patch, by) => {
      const current = await get(id);
      if (!current) return null;
      const { links, checklist, remindAt, ...rest } = patch;
      const reassigned = patch.assigneeId !== undefined && patch.assigneeId !== current.assigneeId;
      const status = patch.status ?? current.status;
      const moved =
        (patch.status && patch.status !== current.status) ||
        (patch.accountId && patch.accountId !== current.accountId);
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
            ? { position: await nextPosition(patch.accountId ?? current.accountId, status) }
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
    columns: async (accountIds) => {
      const rows = accountIds.length
        ? await db
            .select()
            .from(schema.taskBoards)
            .where(inArray(schema.taskBoards.accountId, accountIds))
        : [];
      return Object.fromEntries(
        accountIds.map((id) => {
          const row = rows.find((candidate) => candidate.accountId === id);
          return [id, row ? (JSON.parse(row.columns) as BoardColumn[]) : DEFAULT_COLUMNS];
        }),
      );
    },
    setColumns: async (accountId, columns) => {
      const row = { accountId, columns: JSON.stringify(columns), updatedAt: new Date() };
      await db
        .insert(schema.taskBoards)
        .values(row)
        .onConflictDoUpdate({ target: schema.taskBoards.accountId, set: row });
      const kept = columns.map((column) => column.id);
      const orphans = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(and(eq(schema.tasks.accountId, accountId), notInArray(schema.tasks.status, kept)));
      let position = await nextPosition(accountId, "open");
      for (const { id } of orphans) {
        await db
          .update(schema.tasks)
          .set({ status: "open", position: position++, updatedAt: new Date() })
          .where(eq(schema.tasks.id, id));
      }
    },
  };
};
