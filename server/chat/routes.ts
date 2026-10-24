/**
 * /api/chat: the channels a person sees, their messages, writing, read marks and "typing". Who
 * sees what follows from the person's JMAP session (server/chat/chat.ts `canSee`); every change
 * goes out on the live connection to whoever may see it.
 */
import { Hono } from "hono";
import type { SessionAccount } from "../categories/routes";
import type { Hub } from "../live/hub";
import {
  type Channel,
  canSee,
  channelPatchSchema,
  newChannelSchema,
  newDirectSchema,
  newMessageSchema,
  readSchema,
  type Viewer,
} from "./chat";
import type { ChatStore } from "./store";

export type ChatDeps = {
  store: ChatStore;
  hub: Hub;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
};

const PAGE = 50;

/** The person behind the session: their own account, and every account they can open. */
export const viewerOf = (accounts: SessionAccount[]): Viewer | null => {
  const me = accounts.find((account) => account.isPersonal)?.id;
  return me ? { me, accountIds: accounts.map((account) => account.id) } : null;
};

export const createChatRoutes = ({ store, hub, accountsOf }: ChatDeps) => {
  const app = new Hono<{ Variables: { viewer: Viewer; accounts: SessionAccount[] } }>();

  app.use(async (c, next) => {
    const accounts = await accountsOf(c.req.raw);
    const viewer = accounts && viewerOf(accounts);
    if (!accounts || !viewer) return c.json({ error: "Nicht angemeldet" }, 401);
    c.set("viewer", viewer);
    c.set("accounts", accounts);
    await next();
  });

  /** Tells everyone who may see the channel (and those who just lost it) that the list changed. */
  const announce = (channel: Channel, also: string[] = []) =>
    hub.publish(
      { type: "channels" },
      (viewer) => canSee(channel, viewer) || also.includes(viewer.me),
    );

  const visible = async (id: string, viewer: Viewer) => {
    const channel = await store.get(id);
    return channel && canSee(channel, viewer) ? channel : null;
  };

  app.get("/channels", async (c) => {
    const shared = c
      .get("accounts")
      .filter((account) => !account.isPersonal)
      .map((account) => account.id);
    return c.json({ channels: await store.list(c.get("viewer"), shared), online: hub.online() });
  });

  app.post("/channels", async (c) => {
    const parsed = newChannelSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Bitte einen Namen angeben." }, 400);
    const { me } = c.get("viewer");
    const channel = await store.createChannel(parsed.data.name, parsed.data.members, me);
    announce(channel);
    return c.json({ channel }, 201);
  });

  app.post("/direct", async (c) => {
    const parsed = newDirectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Bitte mindestens eine Person wählen." }, 400);
    const channel = await store.direct(parsed.data.members, c.get("viewer").me);
    announce(channel);
    return c.json({ channel });
  });

  app.patch("/channels/:id", async (c) => {
    const channel = await visible(c.req.param("id"), c.get("viewer"));
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    if (channel.kind !== "channel") {
      return c.json({ error: "Dieser Kanal lässt sich nicht ändern." }, 403);
    }
    const parsed = channelPatchSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const updated = await store.update(channel.id, parsed.data);
    announce(updated!, channel.members);
    return c.json({ channel: updated });
  });

  app.get("/channels/:id/messages", async (c) => {
    const channel = await visible(c.req.param("id"), c.get("viewer"));
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    const before = c.req.query("before");
    const page = await store.messages(channel.id, before ? new Date(before) : null, PAGE + 1);
    return c.json({
      messages: page.slice(0, PAGE),
      hasMore: page.length > PAGE,
      reads: await store.reads(channel.id),
    });
  });

  app.post("/channels/:id/messages", async (c) => {
    const viewer = c.get("viewer");
    const channel = await visible(c.req.param("id"), viewer);
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    const parsed = newMessageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Die Nachricht ist leer." }, 400);
    const message = await store.post(channel.id, viewer.me, parsed.data.text, parsed.data.mentions);
    // What one writes oneself is read.
    await store.markRead(channel.id, viewer.me, new Date(message.createdAt));
    hub.publish({ type: "message", channelId: channel.id, message }, (other) =>
      canSee(channel, other),
    );
    return c.json({ message }, 201);
  });

  app.post("/channels/:id/read", async (c) => {
    const viewer = c.get("viewer");
    const channel = await visible(c.req.param("id"), viewer);
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    const parsed = readSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    const at = (
      await store.markRead(channel.id, viewer.me, new Date(parsed.data.at))
    ).toISOString();
    hub.publish({ type: "read", channelId: channel.id, memberId: viewer.me, at }, (other) =>
      canSee(channel, other),
    );
    return c.json({ at });
  });

  app.post("/channels/:id/typing", async (c) => {
    const viewer = c.get("viewer");
    const channel = await visible(c.req.param("id"), viewer);
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    hub.publish(
      { type: "typing", channelId: channel.id, memberId: viewer.me },
      (other) => other.me !== viewer.me && canSee(channel, other),
    );
    return c.json({ ok: true });
  });

  return app;
};
