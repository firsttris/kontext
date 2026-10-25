/**
 * "Vertraulich senden": /api/secure for whoever sent (make one, see them, read answers, a new code,
 * take one back) and /api/secure-public for the recipient's page – nothing without the code, five
 * wrong ones lock it. The server holds only encrypted content; the key is in the link.
 */
import { Hono } from "hono";
import type { SessionAccount } from "../categories/routes";
import type { Notice } from "../push/pusher";
import {
  codeFits,
  codeSchema,
  hashCode,
  MAX_TRIES,
  newMessageSchema,
  replySchema,
  stateOf,
} from "./secure";
import type { SecureRow, SecureStore } from "./store";

export type SecureDeps = {
  store: SecureStore;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
  notify?: (memberIds: string[], notice: Notice) => Promise<void>;
  now?: () => Date;
};

const DAY = 86_400_000;

/** What the sender's list shows of a message. */
const summary = (row: SecureRow & { replies: number; unreadReplies: number }, now: Date) => ({
  id: row.id,
  to: row.toEmail,
  createdAt: row.createdAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
  openedAt: row.openedAt?.toISOString() ?? null,
  openCount: row.openCount,
  replies: row.replies,
  unreadReplies: row.unreadReplies,
  state: stateOf(row, now),
});

export const createSecureRoutes = ({ store, accountsOf, now = () => new Date() }: SecureDeps) => {
  const app = new Hono<{ Variables: { me: string } }>();
  app.use(async (c, next) => {
    const me = (await accountsOf(c.req.raw))?.find((account) => account.isPersonal)?.id;
    if (!me) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("me", me);
    await next();
  });

  const own = async (id: string, me: string) => {
    const row = await store.get(id);
    return row && row.memberId === me ? row : null;
  };

  app.post("/", async (c) => {
    const parsed = newMessageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const { to, fromName, fromEmail, ciphertext, senderKey, code, expiresDays } = parsed.data;
    const { hash, salt } = hashCode(code);
    const id = crypto.randomUUID();
    const at = now();
    await store.create(
      {
        id,
        memberId: c.get("me"),
        fromName,
        fromEmail,
        toEmail: to,
        senderKey,
        codeHash: hash,
        codeSalt: salt,
        size: ciphertext.length,
        createdAt: at,
        expiresAt: new Date(at.getTime() + expiresDays * DAY),
      },
      ciphertext,
    );
    return c.json({ id }, 201);
  });

  app.get("/", async (c) => {
    const at = now();
    return c.json({
      messages: (await store.ofMember(c.get("me"))).map((row) => summary(row, at)),
    });
  });

  /** For the sender: the content and the answers, all encrypted; answers count as read. */
  app.get("/:id", async (c) => {
    const row = await own(c.req.param("id"), c.get("me"));
    if (!row) return c.json({ error: "Unbekannt" }, 404);
    const replies = await store.replies(row.id);
    await store.markRepliesRead(row.id);
    return c.json({
      senderKey: row.senderKey,
      ciphertext: await store.content(row.id),
      replies: replies.map((reply) => ({
        ciphertext: reply.ciphertext,
        createdAt: reply.createdAt.toISOString(),
      })),
    });
  });

  /** A new code (the old one forgotten, or the page locked): tries start again. */
  app.post("/:id/code", async (c) => {
    const row = await own(c.req.param("id"), c.get("me"));
    if (!row) return c.json({ error: "Unbekannt" }, 404);
    const parsed = codeSchema.safeParse((await c.req.json().catch(() => null))?.code);
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const { hash, salt } = hashCode(parsed.data);
    await store.newCode(row.id, hash, salt);
    return c.json({ ok: true });
  });

  app.delete("/:id", async (c) => {
    const row = await own(c.req.param("id"), c.get("me"));
    if (!row) return c.json({ error: "Unbekannt" }, 404);
    await store.remove(row.id);
    return c.json({ ok: true });
  });

  return app;
};

/** The recipient's side: no sign-in, the code instead. */
export const createSecurePublicRoutes = ({
  store,
  notify = async () => undefined,
  now = () => new Date(),
}: Pick<SecureDeps, "store" | "notify" | "now">) => {
  const app = new Hono();
  const found = async (id: string) => {
    const row = await store.get(id);
    return row ? { row, state: stateOf(row, now()) } : null;
  };

  app.get("/:id", async (c) => {
    const message = await found(c.req.param("id"));
    if (!message) return c.json({ error: "Unbekannt" }, 404);
    return c.json({
      fromName: message.row.fromName,
      fromEmail: message.row.fromEmail,
      expiresAt: message.row.expiresAt.toISOString(),
      state: message.state,
    });
  });

  /** Checks the code; a wrong one counts, the fifth locks. */
  const unlocked = async (id: string, input: unknown) => {
    const message = await found(id);
    if (!message) return { error: "Unbekannt", status: 404 as const };
    if (message.state === "expired") return { error: "Abgelaufen", status: 410 as const };
    if (message.state === "locked") return { error: "Gesperrt", status: 423 as const };
    const code = codeSchema.safeParse(input);
    if (!code.success || !codeFits(code.data, message.row.codeSalt, message.row.codeHash)) {
      const left = MAX_TRIES - message.row.failedTries - 1;
      await store.failed(message.row.id);
      return { error: "Falscher Code", status: 403 as const, left };
    }
    return { row: message.row };
  };

  app.post("/:id/open", async (c) => {
    const body = (await c.req.json().catch(() => null)) as { code?: unknown } | null;
    const result = await unlocked(c.req.param("id"), body?.code);
    if ("error" in result) {
      return c.json(
        { error: result.error, left: "left" in result ? result.left : 0 },
        result.status,
      );
    }
    const first = !result.row.openedAt;
    await store.opened(result.row.id, now());
    if (first) {
      void notify([result.row.memberId], {
        title: `Vertrauliche Nachricht geöffnet`,
        body: `${result.row.toEmail} hat sie gerade geöffnet.`,
        url: "/secure",
        tag: `secure-${result.row.id}`,
      }).catch(() => undefined);
    }
    const replies = await store.replies(result.row.id);
    return c.json({
      ciphertext: await store.content(result.row.id),
      replies: replies.map((reply) => ({
        ciphertext: reply.ciphertext,
        createdAt: reply.createdAt.toISOString(),
      })),
    });
  });

  app.post("/:id/reply", async (c) => {
    const parsed = replySchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const result = await unlocked(c.req.param("id"), parsed.data.code);
    if ("error" in result) {
      return c.json(
        { error: result.error, left: "left" in result ? result.left : 0 },
        result.status,
      );
    }
    await store.addReply(result.row.id, parsed.data.ciphertext);
    void notify([result.row.memberId], {
      title: "Antwort auf vertrauliche Nachricht",
      body: `${result.row.toEmail} hat geantwortet.`,
      url: `/secure?message=${encodeURIComponent(result.row.id)}`,
      tag: `secure-${result.row.id}`,
    }).catch(() => undefined);
    return c.json({ ok: true }, 201);
  });

  return app;
};
