/**
 * The moves under /api/company/migrations (behind the Firmenverwaltung's guard): create one for a
 * person, upload the file in pieces, watch the progress, try again.
 */
import { appendFile, mkdir, rm } from "node:fs/promises";
import { Hono } from "hono";
import { z } from "zod";
import { bad, bodyOf, type Env, notFound, userOf } from "../company/context";
import type { Jobs } from "./jobs";
import { type Runner, uploadFileOf } from "./runner";

export type MigrationDeps = { jobs: Jobs; runner: Runner; workDir: string };

/** Outlook data files can be up to 50 GB. */
const MAX_SIZE = 50 * 1024 ** 3;

const newMigration = z.object({
  accountId: z.string().max(64),
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(MAX_SIZE),
});

export const migrationRoutes = ({ jobs, runner, workDir }: MigrationDeps) => {
  const app = new Hono<Env>();

  app.get("/", async (c) => {
    const ids = new Set(c.get("loaded").company.employees.map((e) => e.id));
    return c.json((await jobs.list()).filter((job) => ids.has(job.accountId)));
  });

  app.post("/", async (c) => {
    const body = await bodyOf(c, newMigration);
    if (!body) return bad("Angaben unvollständig.");
    const source = body.fileName.toLowerCase().match(/\.(pst|vcf|ics)$/)?.[1] as
      | "pst"
      | "vcf"
      | "ics"
      | undefined;
    if (!source)
      return bad(
        "Bitte eine Outlook-Datei (.pst), Kontakte (.vcf) oder einen Kalender (.ics) wählen.",
      );
    const user = userOf(c.get("loaded"), body.accountId);
    if (!user) return bad("Unbekannte Person.");
    await mkdir(workDir, { recursive: true });
    const job = await jobs.create({
      accountId: user.id,
      accountEmail: user.emailAddress ?? "",
      source,
      fileName: body.fileName,
      size: body.size,
    });
    await rm(uploadFileOf(workDir, job.id), { force: true });
    return c.json(job, 201);
  });

  /** One piece of the file at `offset`; the last one starts the move. */
  app.put("/:id/file", async (c) => {
    const job = await jobs.get(c.req.param("id"));
    if (job?.status !== "uploading") return notFound();
    const offset = Number(c.req.query("offset"));
    if (offset !== job.received) {
      return c.json({ error: "Falsche Stelle", received: job.received }, 409);
    }
    const piece = new Uint8Array(await c.req.arrayBuffer());
    if (offset + piece.length > job.size) return bad("Mehr Daten als angekündigt.");
    await appendFile(uploadFileOf(workDir, job.id), piece);
    const received = offset + piece.length;
    const done = received === job.size;
    await jobs.update(job.id, { received, ...(done ? { status: "queued" as const } : {}) });
    if (done) void runner.enqueue(job.id);
    return c.json({ received, status: done ? "queued" : "uploading" });
  });

  app.post("/:id/retry", async (c) => {
    const job = await jobs.get(c.req.param("id"));
    if (job?.status !== "failed") return notFound();
    await jobs.update(job.id, { status: "queued" });
    void runner.enqueue(job.id);
    return c.json({ status: "queued" });
  });

  return app;
};
