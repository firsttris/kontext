/**
 * /api/documents: documents in Kontext, kept by Schreibzeug, a service of its own. The app asks here
 * whether there is one and where (and shows the module "Dokumente" only then). Where the two touch,
 * Kontext's server moves the files itself, server to server, never through the browser:
 *
 * - `POST /save`: a mail's attachment into a folder of Dokumente (the mail stays as it is);
 * - `POST /attach`: a file of Dokumente as a blob for a mail being written;
 * - `GET /folders`: what a folder holds, for choosing where to put something or what to attach;
 * - `POST /share`: lets colleagues open a file that went into a chat, a task, an appointment or a
 *   contact; for a shared mailbox's channel, board or address book, everyone who works in it;
 * - `GET /mailboxes`: the folders of the shared mailboxes the person works in (mailboxes.ts).
 *
 * The mail side goes with the person's own Stalwart token, the documents side with a token for the
 * person (schreibzeug.ts): each side allows only what the person may do there.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { MailboxFolders } from "./mailboxes";
import type { Person, Schreibzeug } from "./schreibzeug";

/** Who asks, and their token for Stalwart. */
export type Asker = { person: Person; stalwartToken: string };

export type DocumentsDeps = {
  /** Schreibzeug's address for the browser, or null without Schreibzeug. */
  url: string | null;
  /** Its API, when Kontext signs people in there too (needs the client secret). */
  schreibzeug: Schreibzeug | null;
  askerOf: (request: Request) => Promise<Asker | null>;
  /** The shared mailboxes' folders; null without Stalwart's admin key. */
  mailboxes: MailboxFolders | null;
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

const shareSchema = z.object({
  fileId: z.string().min(1).max(64),
  emails: z.array(z.email().max(320)).max(200),
  /** Shared mailboxes (their account ids) whose people should open it too. */
  mailboxes: z.array(z.string().min(1).max(128)).max(50).default([]),
});

/** Tries each in turn until one works; the first one's error otherwise. */
const firstThat = async <T>(
  each: T[],
  attempt: (item: T) => Promise<void>,
): Promise<{ ok: true } | { ok: false; error: unknown }> => {
  let first: unknown = null;
  for (const item of each) {
    try {
      await attempt(item);
      return { ok: true };
    } catch (error) {
      first ??= error;
    }
  }
  return { ok: false, error: first };
};

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export const createDocumentsRoutes = ({
  url,
  schreibzeug,
  askerOf,
  mailboxes,
  blobs,
}: DocumentsDeps) => {
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

  app.get("/mailboxes", async (c) => {
    if (!mailboxes) return c.json([]);
    try {
      return c.json(await mailboxes.foldersFor(c.get("asker").person.email));
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

  // Viewing only; whoever should change it gets more rights in Dokumente itself.
  app.post("/share", async (c) => {
    const parsed = shareSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const { fileId, emails } = parsed.data;
    const { person } = c.get("asker");
    try {
      const ofMailboxes =
        mailboxes && parsed.data.mailboxes.length
          ? await mailboxes.peopleOf(person.email, parsed.data.mailboxes)
          : [];
      const others = [
        ...new Set([...emails, ...ofMailboxes].map((email) => email.toLowerCase())),
      ].filter((email) => email !== person.email.toLowerCase());
      const shareAs = async (owner: Person) => {
        for (const email of others) await c.get("schreibzeug").share(owner, fileId, email, "view");
      };
      // A file in a shared mailbox's folder belongs to the mailbox, which shares it then.
      const owners = [person, ...(mailboxes ? await mailboxes.ownersFor(person.email) : [])];
      const shared = await firstThat(owners, shareAs);
      if (!shared.ok) throw shared.error;
      return c.json({ shared: others });
    } catch (error) {
      return c.json({ error: message(error) }, 502);
    }
  });

  return app;
};
