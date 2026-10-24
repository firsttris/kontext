/** Text snippets in Kontext's SQLite. */
import { asc, eq, inArray } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import type { Snippet } from "./snippets";

export type SnippetStore = {
  list: (accountIds: string[]) => Promise<Snippet[]>;
  get: (id: string) => Promise<Snippet | null>;
  create: (input: Pick<Snippet, "accountId" | "title" | "body">, by: string) => Promise<Snippet>;
  update: (id: string, patch: Partial<Pick<Snippet, "title" | "body">>) => Promise<Snippet | null>;
  remove: (id: string) => Promise<void>;
};

type Row = typeof schema.snippets.$inferSelect;
const toSnippet = (row: Row): Snippet => ({
  id: row.id,
  accountId: row.accountId,
  title: row.title,
  body: row.body,
  createdBy: row.createdBy,
  updatedAt: row.updatedAt.toISOString(),
});

export const createSnippetStore = (db: Db): SnippetStore => {
  const get = async (id: string) => {
    const [row] = await db.select().from(schema.snippets).where(eq(schema.snippets.id, id));
    return row ? toSnippet(row) : null;
  };
  return {
    list: async (accountIds) =>
      accountIds.length
        ? (
            await db
              .select()
              .from(schema.snippets)
              .where(inArray(schema.snippets.accountId, accountIds))
              .orderBy(asc(schema.snippets.title))
          ).map(toSnippet)
        : [],
    get,
    create: async (input, by) => {
      const now = new Date();
      const row = {
        id: crypto.randomUUID(),
        ...input,
        createdBy: by,
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(schema.snippets).values(row);
      return toSnippet(row);
    },
    update: async (id, patch) => {
      await db
        .update(schema.snippets)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(schema.snippets.id, id));
      return get(id);
    },
    remove: async (id) => {
      await db.delete(schema.snippets).where(eq(schema.snippets.id, id));
    },
  };
};
