/** The IMAP moves (Gmail & Co.) in Sekretär's SQLite, with the sealed password and the state. */
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";

export type SyncStatus = "active" | "running" | "login-failed" | "finished";
/** Per old folder: for IMAP its UIDVALIDITY and last UID, for Microsoft 365 the delta link. */
export type FolderState = { uidValidity?: string; lastUid?: number; deltaLink?: string };
/** Mails imported, put into one more folder, failed; contacts and appointments added. */
export type SyncCounts = {
  imported: number;
  added: number;
  failed: number;
  contacts?: number;
  events?: number;
};

export type Sync = {
  id: string;
  accountId: string;
  accountEmail: string;
  provider: string;
  host: string;
  port: number;
  login: string;
  secret: string;
  status: SyncStatus;
  state: Record<string, FolderState>;
  counts: SyncCounts;
  lastRunAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type Row = typeof schema.mailSync.$inferSelect;
const toSync = (row: Row): Sync => ({
  ...row,
  state: JSON.parse(row.state) as Sync["state"],
  counts: JSON.parse(row.counts) as SyncCounts,
});

type Patch = Partial<
  Pick<Sync, "status" | "state" | "counts" | "lastRunAt" | "lastError" | "secret">
>;

export const createSyncs = (db: Db) => {
  const get = async (id: string): Promise<Sync | null> => {
    const [row] = await db.select().from(schema.mailSync).where(eq(schema.mailSync.id, id));
    return row ? toSync(row) : null;
  };

  const list = async (): Promise<Sync[]> =>
    (await db.select().from(schema.mailSync).orderBy(desc(schema.mailSync.createdAt))).map(toSync);

  const create = async (
    input: Pick<
      Sync,
      "accountId" | "accountEmail" | "provider" | "host" | "port" | "login" | "secret"
    >,
  ): Promise<Sync> => {
    const now = new Date();
    const row = {
      ...input,
      id: crypto.randomUUID(),
      status: "active" as const,
      state: "{}",
      counts: JSON.stringify({ imported: 0, added: 0, failed: 0 }),
      lastRunAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(schema.mailSync).values(row);
    return toSync(row);
  };

  const update = async (id: string, patch: Patch): Promise<void> => {
    const { state, counts, ...rest } = patch;
    await db
      .update(schema.mailSync)
      .set({
        ...rest,
        ...(state ? { state: JSON.stringify(state) } : {}),
        ...(counts ? { counts: JSON.stringify(counts) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.mailSync.id, id));
  };

  return { get, list, create, update };
};

export type Syncs = ReturnType<typeof createSyncs>;
