/**
 * /api/documents: documents in Kontext, kept by Schreibzeug, a service of its own. The app asks here
 * whether there is one and where (and shows the module "Dokumente" only then). Where the two touch,
 * Kontext's server moves the files itself, server to server, never through the browser:
 *
 * - `POST /save`: a mail's attachment into a folder of Dokumente (the mail stays as it is);
 * - `POST /attach`: a file of Dokumente as a blob for a mail being written;
 * - `GET /folders`: what a folder holds, for choosing where to put something or what to attach.
 *
 * The mail side goes with the person's own Stalwart token, the documents side with a token for the
 * person (schreibzeug.ts): each side allows only what the person may do there.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Person, Schreibzeug } from "./schreibzeug";

/** Who asks, and their token for Stalwart. */
export type Asker = { person: Person; stalwartToken: string };

export type DocumentsDeps = {
  /** Schreibzeug's address for the browser, or null without Schreibzeug. */
  url: string | null;
  /** Its API, when Kontext signs people in there too (needs the client secret). */
  schreibzeug: Schreibzeug | null;
  askerOf: (request: Request) => Promise<Asker | null>;
  /** Stalwart's JMAP blobs with the person's token (RFC 8620 §6). */
  blobs: {
    download: (token: string, accountId: string, blobId: string) => Promise<Blob>;
    upload: (token: string, accountId: string, file: Blob) => Promise<string>;
  };
};

const folderIdSchema = z.string().min(1).max(64).nullable();

const saveSchema = z.object({
  accountId: z.string().min(1).max(128),
  blobId: z.string().min(1).max(256),
  name: z.string().trim().min(1).max(255),
  type: z.string().max(255).default("application/octet-stream"),
  folderId: folderIdSchema.default(null),
});

const attachSchema = z.object({
  accountId: z.string().min(1).max(128),
  fileId: z.string().min(1).max(64),
});

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const createDocumentsRoutes = ({ url, schreibzeug, askerOf, blobs }: DocumentsDeps) => {
  const app = new Hono<{ Variables: { asker: Asker; schreibzeug: Schreibzeug } }>();
  app.get("/", (c) => c.json({ url, connected: Boolean(schreibzeug) }));

  app.use("/*", async (c, next) => {
    if (!schreibzeug) return c.json({ error: "Dokumente sind nicht eingerichtet." }, 404);
    const asker = await askerOf(c.req.raw);
    if (!asker) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("asker", asker);
    c.set("schreibzeug", schreibzeug);
    await next();
  });

  app.get("/folders", async (c) => {
    const parent = folderIdSchema.safeParse(c.req.query("parent") || null);
    if (!parent.success) return c.json({ error: "Unbekannter Ordner" }, 400);
    try {
      return c.json(await c.get("schreibzeug").list(c.get("asker").person, parent.data));
    } catch (error) {
      return c.json({ error: message(error) }, 502);
    }
  });

  app.post("/save", async (c) => {
    const parsed = saveSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const { accountId, blobId, name, type, folderId } = parsed.data;
    const { person, stalwartToken } = c.get("asker");
    try {
      const blob = await blobs.download(stalwartToken, accountId, blobId);
      const file = new File([blob], name, { type });
      const node = await c.get("schreibzeug").upload(person, folderId, file);
      return c.json({ id: node.id, name: node.name }, 201);
    } catch (error) {
      return c.json({ error: message(error) }, 502);
    }
  });

  app.post("/attach", async (c) => {
    const parsed = attachSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const { accountId, fileId } = parsed.data;
    const { person, stalwartToken } = c.get("asker");
    try {
      const file = await c.get("schreibzeug").download(person, fileId);
      const blobId = await blobs.upload(stalwartToken, accountId, file);
      return c.json({ blobId, name: file.name, type: file.type, size: file.size });
    } catch (error) {
      return c.json({ error: message(error) }, 502);
    }
  });

  return app;
};
