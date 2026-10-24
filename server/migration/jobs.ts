/** The moves and their progress in Kontext's SQLite, so they survive a restart. */
import { desc, eq } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";

export type Count = { total: number; imported: number; skipped: number; failed: number };
export type Progress = { mails: Count; contacts: Count; events: Count };
export type JobStatus = "uploading" | "queued" | "running" | "done" | "failed";

export type Job = {
  id: string;
  accountId: string;
  accountEmail: string;
  source: "pst" | "vcf" | "ics";
  fileName: string;
  size: number;
  received: number;
  status: JobStatus;
  progress: Progress;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const zero = (): Count => ({ total: 0, imported: 0, skipped: 0, failed: 0 });
export const emptyProgress = (): Progress => ({ mails: zero(), contacts: zero(), events: zero() });

type Row = typeof schema.migrationJob.$inferSelect;
const toJob = (row: Row): Job => ({ ...row, progress: JSON.parse(row.progress) as Progress });

export const createJobs = (db: Db) => {
  const get = async (id: string): Promise<Job | null> => {
    const [row] = await db.select().from(schema.migrationJob).where(eq(schema.migrationJob.id, id));
    return row ? toJob(row) : null;
  };

  const create = async (
    input: Pick<Job, "accountId" | "accountEmail" | "source" | "fileName" | "size">,
  ): Promise<Job> => {
    const now = new Date();
    const row = {
      ...input,
      id: crypto.randomUUID(),
      received: 0,
      status: "uploading" as const,
      progress: JSON.stringify(emptyProgress()),
      error: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(schema.migrationJob).values(row);
    return toJob(row);
  };

  const update = async (
    id: string,
    patch: Partial<Pick<Job, "received" | "status" | "progress" | "error">>,
  ): Promise<void> => {
    const { progress, ...rest } = patch;
    await db
      .update(schema.migrationJob)
      .set({
        ...rest,
        ...(progress ? { progress: JSON.stringify(progress) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.migrationJob.id, id));
  };

  const list = async (): Promise<Job[]> =>
    (await db.select().from(schema.migrationJob).orderBy(desc(schema.migrationJob.createdAt))).map(
      toJob,
    );

  return { get, create, update, list };
};

export type Jobs = ReturnType<typeof createJobs>;
