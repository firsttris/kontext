/** External accounts (Gmail, GMX, …) in Kontext's SQLite, with the sealed password and the state. */
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import type { FolderState, SyncCounts } from "../migration/syncs";

export type ExternalStatus = "active" | "running" | "login-failed";
export type ExternalTarget = "inbox" | "folder";

export type ExternalAccount = {
  id: string;
  accountId: string;
  email: string;
  name: string;
  provider: string;
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  login: string;
  secret: string;
  target: ExternalTarget;
  folderId: string | null;
  status: ExternalStatus;
  state: FolderState | null;
  counts: SyncCounts;
  lastRunAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Row = typeof schema.externalAccount.$inferSelect;
const toAccount = (row: Row): ExternalAccount => ({
  ...row,
  state: JSON.parse(row.state) as FolderState | null,
  counts: JSON.parse(row.counts) as SyncCounts,
});

export type NewExternalAccount = Pick<
  ExternalAccount,
  | "accountId"
  | "email"
  | "name"
  | "provider"
  | "imapHost"
  | "imapPort"
  | "smtpHost"
  | "smtpPort"
  | "login"
  | "secret"
  | "target"
  | "state"
>;

export type ExternalPatch = Partial<
  Pick<
    ExternalAccount,
    "name" | "secret" | "status" | "state" | "counts" | "folderId" | "lastRunAt" | "lastError"
  >
>;

export const createExternalStore = (db: Db) => {
  const table = schema.externalAccount;

  const get = async (id: string): Promise<ExternalAccount | null> => {
    const [row] = await db.select().from(table).where(eq(table.id, id));
    return row ? toAccount(row) : null;
  };

  const list = async (): Promise<ExternalAccount[]> =>
    (await db.select().from(table).orderBy(table.createdAt)).map(toAccount);

  /** One person's accounts. */
  const listFor = async (accountId: string): Promise<ExternalAccount[]> =>
    (
      await db.select().from(table).where(eq(table.accountId, accountId)).orderBy(table.createdAt)
    ).map(toAccount);

  const create = async (input: NewExternalAccount): Promise<ExternalAccount> => {
    const now = new Date();
    const row = {
      ...input,
      id: crypto.randomUUID(),
      folderId: null,
      status: "active" as const,
      state: JSON.stringify(input.state),
      counts: JSON.stringify({ imported: 0, added: 0, failed: 0 }),
      lastRunAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(table).values(row);
    return toAccount(row);
  };

  const update = async (id: string, patch: ExternalPatch): Promise<void> => {
    const { state, counts, ...rest } = patch;
    await db
      .update(table)
      .set({
        ...rest,
        ...(state !== undefined ? { state: JSON.stringify(state) } : {}),
        ...(counts ? { counts: JSON.stringify(counts) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(table.id, id));
  };

  /** Removes one of the person's accounts; false when it is not theirs. */
  const remove = async (accountId: string, id: string): Promise<boolean> => {
    const removed = await db
      .delete(table)
      .where(and(eq(table.id, id), eq(table.accountId, accountId)))
      .returning({ id: table.id });
    return removed.length > 0;
  };

  return { get, list, listFor, create, update, remove };
};

export type ExternalStore = ReturnType<typeof createExternalStore>;
