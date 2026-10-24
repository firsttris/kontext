/** Tasks in Kontext's SQLite: one row per task, its links to mails, contacts and appointments. */
import { and, eq, gte, inArray, isNull, max, ne, or } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import type { CheckItem, NewTaskData, Task, TaskLink, TaskPatch, TaskStatus } from "./tasks";

export type TaskStore = {
  /** Open tasks of these accounts, and the ones finished since `doneSince`. */
  list: (accountIds: string[], doneSince: Date) => Promise<Task[]>;
  get: (id: string) => Promise<Task | null>;
  create: (task: NewTaskData, createdBy: string) => Promise<Task>;
  update: (id: string, patch: TaskPatch) => Promise<Task | null>;
  remove: (id: string) => Promise<void>;
};

type Row = typeof schema.tasks.$inferSelect;
type LinkRow = typeof schema.taskLinks.$inferSelect;

const toTask = (row: Row, links: LinkRow[]): Task => ({
  id: row.id,
  accountId: row.accountId,
  title: row.title,
  notes: row.notes,
  status: row.status as TaskStatus,
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
    list: async (accountIds, doneSince) => {
      if (!accountIds.length) return [];
      const rows = await db
        .select()
        .from(schema.tasks)
        .where(
          and(
            inArray(schema.tasks.accountId, accountIds),
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
        createdAt: now,
        updatedAt: now,
      });
      await writeLinks(id, task.links);
      return (await get(id))!;
    },
    update: async (id, patch) => {
      const current = await get(id);
      if (!current) return null;
      const { links, checklist, ...rest } = patch;
      const status = patch.status ?? current.status;
      const moved =
        (patch.status && patch.status !== current.status) ||
        (patch.accountId && patch.accountId !== current.accountId);
      await db
        .update(schema.tasks)
        .set({
          ...rest,
          ...(checklist ? { checklist: JSON.stringify(checklist) } : {}),
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
  };
};
