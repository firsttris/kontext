/** The categories per account in Sekretär's SQLite; an account without its own list gets the defaults. */
import { inArray } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import { type Category, categoriesSchema, DEFAULT_CATEGORIES } from "./categories";

export type CategoryStore = {
  list: (accountIds: string[]) => Promise<Record<string, Category[]>>;
  save: (accountId: string, categories: Category[]) => Promise<void>;
};

const parse = (value: string): Category[] => {
  try {
    const parsed = categoriesSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : DEFAULT_CATEGORIES;
  } catch {
    return DEFAULT_CATEGORIES;
  }
};

export const createCategoryStore = (db: Db): CategoryStore => ({
  list: async (accountIds) => {
    if (!accountIds.length) return {};
    const rows = await db
      .select()
      .from(schema.mailCategories)
      .where(inArray(schema.mailCategories.accountId, accountIds));
    const stored = new Map(rows.map((row) => [row.accountId, parse(row.categories)]));
    return Object.fromEntries(accountIds.map((id) => [id, stored.get(id) ?? DEFAULT_CATEGORIES]));
  },
  save: async (accountId, categories) => {
    const row = { accountId, categories: JSON.stringify(categories), updatedAt: new Date() };
    await db
      .insert(schema.mailCategories)
      .values(row)
      .onConflictDoUpdate({ target: schema.mailCategories.accountId, set: row });
  },
});
