/**
 * /api/chat answers and reactions: the thread of a message, and emojis on messages. Mounted by
 * routes.ts behind its sign-in check; who sees the channel may read, answer and react.
 */
import { Hono } from "hono";
import type { SessionAccount } from "../categories/routes";
import type { Hub } from "../live/hub";
import { type Channel, canSee, reactionSchema, type Viewer } from "./chat";
import type { MessageStore } from "./messages";
import type { ChatStore } from "./store";

export const createThreadRoutes = ({
  store,
  messages,
  hub,
}: {
  store: Pick<ChatStore, "get">;
  messages: MessageStore;
  hub: Hub;
}) => {
  const app = new Hono<{ Variables: { viewer: Viewer; accounts: SessionAccount[] } }>();

  /** A message in a channel one sees. */
  const seen = async (id: string, viewer: Viewer) => {
    const message = await messages.get(id);
    const channel = message && (await store.get(message.channelId));
    return message && channel && canSee(channel, viewer) ? { message, channel } : null;
  };

  app.get("/messages/:id/replies", async (c) => {
    const found = await seen(c.req.param("id"), c.get("viewer"));
    if (!found || found.message.parentId) return c.json({ error: "Unbekannte Nachricht" }, 404);
    return c.json({ message: found.message, replies: await messages.replies(found.message.id) });
  });

  app.post("/messages/:id/reactions", async (c) => {
    const viewer = c.get("viewer");
    const found = await seen(c.req.param("id"), viewer);
    if (!found || found.message.deleted) return c.json({ error: "Unbekannte Nachricht" }, 404);
    const parsed = reactionSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Kein Emoji." }, 400);
    const message = await messages.react(
      found.message.id,
      viewer.me,
      parsed.data.emoji,
      parsed.data.on,
    );
    publishChanged(hub, found.channel, message);
    return c.json({ message });
  });

  return app;
};

/** A message changed in place (edited, deleted, reacted to, answered): to who sees the channel. */
export const publishChanged = (
  hub: Hub,
  channel: Channel,
  message: Awaited<ReturnType<MessageStore["get"]>> & object,
) =>
  hub.publish({ type: "changed", channelId: channel.id, message }, (other) =>
    canSee(channel, other),
  );
