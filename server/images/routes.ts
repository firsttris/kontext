/** /api/image-senders: the senders whose pictures one's mails show at once, per person. */
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { SessionAccount } from "../categories/routes";
import type { Db } from "../db";
import * as schema from "../db/schema";
import { senderSchema } from "./senders";

export const createImageSenderRoutes = ({
  db,
  accountsOf,
}: {
  db: Db;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
}) => {
  const app = new Hono<{ Variables: { me: string } }>();
  app.use(async (c, next) => {
    const me = (await accountsOf(c.req.raw))?.find((account) => account.isPersonal)?.id;
    if (!me) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("me", me);
    await next();
  });

  const list = async (me: string) =>
    (
      await db
        .select({ address: schema.imageSenders.address })
        .from(schema.imageSenders)
        .where(eq(schema.imageSenders.memberId, me))
        .orderBy(asc(schema.imageSenders.address))
    ).map((row) => row.address);

  app.get("/", async (c) => c.json({ senders: await list(c.get("me")) }));

  app.put("/", async (c) => {
    const parsed = senderSchema.safeParse((await c.req.json().catch(() => null))?.address);
    if (!parsed.success) return c.json({ error: "Keine gültige Adresse." }, 400);
    await db
      .insert(schema.imageSenders)
      .values({ memberId: c.get("me"), address: parsed.data, createdAt: new Date() })
      .onConflictDoNothing();
    return c.json({ senders: await list(c.get("me")) });
  });

  app.post("/remove", async (c) => {
    const parsed = senderSchema.safeParse((await c.req.json().catch(() => null))?.address);
    if (!parsed.success) return c.json({ error: "Keine gültige Adresse." }, 400);
    await db
      .delete(schema.imageSenders)
      .where(
        and(
          eq(schema.imageSenders.memberId, c.get("me")),
          eq(schema.imageSenders.address, parsed.data),
        ),
      );
    return c.json({ senders: await list(c.get("me")) });
  });

  return app;
};
