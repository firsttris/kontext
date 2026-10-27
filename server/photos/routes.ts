/**
 * /api/photos: the profile photos of the company's people. Everyone signed in sees all of them
 * (chat, calls, tasks, mails between colleagues); each person sets and removes only their own.
 */
import { Hono } from "hono";
import { limitBody } from "../body-limit";
import type { SessionAccount } from "../categories/routes";
import { checkPhoto, MAX_PHOTO_BYTES } from "./photo";
import type { PhotoStore } from "./store";

export const createPhotoRoutes = ({
  store,
  accountsOf,
}: {
  store: PhotoStore;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
}) => {
  const app = new Hono<{ Variables: { me: string } }>();
  app.use(async (c, next) => {
    const me = (await accountsOf(c.req.raw))?.find((account) => account.isPersonal)?.id;
    if (!me) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("me", me);
    await next();
  });

  app.get("/", async (c) => c.json({ photos: await store.list() }));

  app.get("/:id", async (c) => {
    const bytes = await store.read(c.req.param("id"));
    if (!bytes) return c.json({ error: "Kein Foto" }, 404);
    return new Response(Buffer.from(bytes), {
      headers: {
        "content-type": "image/jpeg",
        // The app asks with `?v=<version>`; a new photo has a new URL.
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  });

  app.put("/", limitBody(MAX_PHOTO_BYTES), async (c) => {
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const check = checkPhoto(bytes);
    if (!check.ok) return c.json({ error: check.error }, 400);
    const version = await store.save(c.get("me"), bytes);
    return c.json({ photos: await store.list(), version });
  });

  app.delete("/", async (c) => {
    await store.remove(c.get("me"));
    return c.json({ photos: await store.list() });
  });

  return app;
};
