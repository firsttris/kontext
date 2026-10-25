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
  channelLabel,
  channelPatchSchema,
  chatNotice,
  editMessageSchema,
  fitsConfidential,
  INLINE_TYPES,
  looksSealed,
  MAIL_COPY_TYPE,
  MAX_FILE_BYTES,
  type Message,
  muteSchema,
  newChannelSchema,
  newDirectSchema,
  newMessageSchema,
  notifyWho,
  readSchema,
  SEALED_FILE_TYPE,
  searchSchema,
  type Viewer,
} from "./chat";
import type { ChatFiles } from "./files";
import type { MessageStore } from "./messages";
import type { ChatStore } from "./store";
import { createThreadRoutes, publishChanged } from "./thread-routes";

export type ChatDeps = {
  store: ChatStore;
  messages: MessageStore;
  files: ChatFiles;
  hub: Hub;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
  /** Tells people of a new message on their devices (Web Push); left out, nobody is told. */
  notify?: (memberIds: string[], notice: ReturnType<typeof chatNotice>) => Promise<void>;
  /** The display name of who is asking, for the notification. */
  nameOf?: (request: Request) => Promise<string>;
  /** How many days the company keeps messages (0: for ever), to say so in the chat. */
  retentionDays?: () => Promise<number>;
  /** A person's own OpenPGP key (server/pgp/): public part, address, fingerprint. */
  publicKeyOf?: (memberId: string) => Promise<MemberKey | null>;
};

const NOT_SEALED =
  "In einem vertraulichen Kanal gehen nur verschlüsselte Nachrichten und Dateien, ohne Karten.";

const PAGE = 50;

/** The person behind the session: their own account, and every account they can open. */
export type MemberKey = { publicKey: string; email: string; fingerprint: string };

export const viewerOf = (accounts: SessionAccount[]): Viewer | null => {
  const me = accounts.find((account) => account.isPersonal)?.id;
  return me ? { me, accountIds: accounts.map((account) => account.id) } : null;
};

export const createChatRoutes = ({
  store,
  messages,
  files,
  hub,
  accountsOf,
  notify,
  nameOf,
  retentionDays = async () => 0,
  publicKeyOf = async () => null,
}: ChatDeps) => {
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
    return c.json({
      channels: await store.list(c.get("viewer"), shared),
      online: hub.online(),
      retentionDays: await retentionDays(),
    });
  });

  /** Who of these has no own key yet: none may be in a confidential channel without one. */
  const withoutKey = async (members: string[]) => {
    const missing: string[] = [];
    for (const id of new Set(members)) if (!(await publicKeyOf(id))) missing.push(id);
    return missing;
  };
  const keyProblem = (missing: string[]) => ({
    error: "Für einen vertraulichen Kanal braucht jedes Mitglied einen eigenen Schlüssel.",
    missing,
  });

  app.post("/channels", async (c) => {
    const parsed = newChannelSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Bitte einen Namen angeben." }, 400);
    const { me } = c.get("viewer");
    if (parsed.data.confidential) {
      const missing = await withoutKey([me, ...parsed.data.members]);
      if (missing.length) return c.json(keyProblem(missing), 400);
    }
    const channel = await store.createChannel(
      parsed.data.name,
      parsed.data.members,
      me,
      parsed.data.confidential,
    );
    announce(channel);
    return c.json({ channel }, 201);
  });

  app.post("/direct", async (c) => {
    const parsed = newDirectSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Bitte mindestens eine Person wählen." }, 400);
    const { me } = c.get("viewer");
    if (parsed.data.confidential) {
      const missing = await withoutKey([me, ...parsed.data.members]);
      if (missing.length) return c.json(keyProblem(missing), 400);
    }
    const channel = await store.direct(parsed.data.members, me, parsed.data.confidential);
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
    if (channel.confidential && parsed.data.members) {
      const missing = await withoutKey(parsed.data.members);
      if (missing.length) return c.json(keyProblem(missing), 400);
    }
    const updated = await store.update(channel.id, parsed.data);
    announce(updated!, channel.members);
    return c.json({ channel: updated });
  });

  /** The members' public keys, to encrypt to all of them and check who signed. */
  app.get("/channels/:id/keys", async (c) => {
    const channel = await visible(c.req.param("id"), c.get("viewer"));
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    // With address and fingerprint, so the app notices when someone's key changed.
    const keys: (MemberKey & { memberId: string })[] = [];
    for (const memberId of channel.members) {
      const key = await publicKeyOf(memberId);
      if (key) keys.push({ memberId, ...key });
    }
    return c.json({ keys });
  });

  app.get("/channels/:id/messages", async (c) => {
    const channel = await visible(c.req.param("id"), c.get("viewer"));
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    const before = c.req.query("before");
    const page = await messages.page(channel.id, before ? new Date(before) : null, PAGE + 1);
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
    if (channel.confidential) {
      const uploads = await Promise.all(parsed.data.fileIds.map((id) => files.get(id)));
      const sealed = uploads.every((file) => file?.type === SEALED_FILE_TYPE);
      if (!fitsConfidential(parsed.data, sealed)) return c.json({ error: NOT_SEALED }, 400);
    }
    // An answer goes to a message of this channel itself, not to another answer.
    const parent = parsed.data.parentId ? await messages.get(parsed.data.parentId) : null;
    if (parsed.data.parentId && (!parent || parent.channelId !== channel.id || parent.parentId)) {
      return c.json({ error: "Unbekannte Nachricht" }, 404);
    }
    const message = await messages.post({
      ...parsed.data,
      channelId: channel.id,
      authorId: viewer.me,
    });
    // What one writes oneself is read.
    await store.markRead(channel.id, viewer.me, new Date(message.createdAt));
    hub.publish({ type: "message", channelId: channel.id, message }, (other) =>
      canSee(channel, other),
    );
    // The first message of the thread shows one more answer.
    if (parent) publishChanged(hub, channel, (await messages.get(parent.id))!);
    if (notify) void tell(c.req.raw, channel, message).catch(() => undefined);
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

  /** Notifications for a new message on the devices of who it is for. */
  const tell = async (request: Request, channel: Channel, message: Message) => {
    const thread = message.parentId ? await messages.threadPeople(message.parentId) : [];
    const who = notifyWho(channel, message, await store.audience(channel.id), thread);
    if (!who.length || !notify) return;
    const accounts = (await accountsOf(request)) ?? [];
    const where = channelLabel(channel, (id) => accounts.find((a) => a.id === id)?.name);
    const author = (await nameOf?.(request)) ?? "";
    await notify(who, chatNotice(channel, message, author, where));
  };

  /** One's own message in a channel one still sees, not yet deleted. */
  const ownMessage = async (id: string, viewer: Viewer) => {
    const message = await messages.get(id);
    if (!message || message.authorId !== viewer.me || message.deleted) return null;
    const channel = await visible(message.channelId, viewer);
    return channel ? { message, channel } : null;
  };
  const changed = (channel: Channel, message: Message) => publishChanged(hub, channel, message);

  app.patch("/messages/:id", async (c) => {
    const own = await ownMessage(c.req.param("id"), c.get("viewer"));
    if (!own) return c.json({ error: "Nur eigene Nachrichten lassen sich ändern." }, 404);
    const parsed = editMessageSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Die Nachricht ist leer." }, 400);
    if (own.channel.confidential && !fitsConfidential(parsed.data)) {
      return c.json({ error: NOT_SEALED }, 400);
    }
    const message = await messages.edit(own.message.id, parsed.data.text, parsed.data.mentions);
    changed(own.channel, message);
    return c.json({ message });
  });

  app.delete("/messages/:id", async (c) => {
    const own = await ownMessage(c.req.param("id"), c.get("viewer"));
    if (!own) return c.json({ error: "Nur eigene Nachrichten lassen sich löschen." }, 404);
    const message = await messages.remove(own.message.id);
    changed(own.channel, message);
    return c.json({ message });
  });

  /** Messages with these words in all channels one sees. */
  app.get("/search", async (c) => {
    const words = searchSchema.safeParse(c.req.query("q") ?? "");
    if (!words.success) return c.json({ messages: [] });
    const viewer = c.get("viewer");
    const shared = c
      .get("accounts")
      .filter((account) => !account.isPersonal)
      .map((account) => account.id);
    const ids = (await store.list(viewer, shared)).map((channel) => channel.id);
    return c.json({ messages: await messages.search(ids, words.data, 30) });
  });

  app.post("/channels/:id/mute", async (c) => {
    const viewer = c.get("viewer");
    const channel = await visible(c.req.param("id"), viewer);
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    const parsed = muteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Angaben unvollständig." }, 400);
    await store.mute(channel.id, viewer.me, parsed.data.muted);
    return c.json({ muted: parsed.data.muted });
  });

  app.post("/channels/:id/leave", async (c) => {
    const viewer = c.get("viewer");
    const channel = await visible(c.req.param("id"), viewer);
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    if (channel.kind !== "channel") {
      return c.json({ error: "Diesen Kanal kann man nicht verlassen." }, 403);
    }
    await store.leave(channel.id, viewer.me);
    announce(channel, [viewer.me]);
    return c.json({ ok: true });
  });

  /** Only who made a named channel removes it, with all its messages and files. */
  app.delete("/channels/:id", async (c) => {
    const viewer = c.get("viewer");
    const channel = await visible(c.req.param("id"), viewer);
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    if (channel.kind !== "channel" || channel.createdBy !== viewer.me) {
      return c.json({ error: "Nur wer den Kanal angelegt hat, kann ihn löschen." }, 403);
    }
    await files.removeOfChannel(channel.id);
    await store.remove(channel.id);
    announce(channel);
    return c.json({ ok: true });
  });

  app.post("/channels/:id/files", async (c) => {
    const viewer = c.get("viewer");
    const channel = await visible(c.req.param("id"), viewer);
    if (!channel) return c.json({ error: "Unbekannter Kanal" }, 404);
    const form = await c.req.formData().catch(() => null);
    const file = form?.get("file");
    const thumb = form?.get("thumb");
    // A form field is text or a file.
    if (!file || typeof file === "string" || file.size === 0) {
      return c.json({ error: "Keine Datei." }, 400);
    }
    if (file.size > MAX_FILE_BYTES) {
      return c.json({ error: "Die Datei ist größer als 25 MB." }, 413);
    }
    const sealed = form?.get("kind") === "sealed";
    // In a confidential channel only encrypted files, without a readable name or small picture.
    if (sealed !== channel.confidential) return c.json({ error: NOT_SEALED }, 400);
    if (sealed) {
      const [first] = new Uint8Array(await file.slice(0, 1).arrayBuffer());
      if (!looksSealed(first)) return c.json({ error: NOT_SEALED }, 400);
      const blind = new File([file], "verschlüsselt", { type: SEALED_FILE_TYPE });
      return c.json(
        { file: await files.save(channel.id, viewer.me, blind, undefined, SEALED_FILE_TYPE) },
        201,
      );
    }
    const small = thumb && typeof thumb !== "string" ? thumb : undefined;
    // A mail shared as a copy says so; its content is shown only from its card.
    const type = form?.get("kind") === "mail-copy" ? MAIL_COPY_TYPE : file.type;
    return c.json({ file: await files.save(channel.id, viewer.me, file, small, type) }, 201);
  });

  app.get("/files/:id", async (c) => {
    const file = await files.get(c.req.param("id"));
    const channel = file && (await visible(file.channelId, c.get("viewer")));
    if (!file || !channel) return c.json({ error: "Unbekannte Datei" }, 404);
    // The small picture of a photo, where there is one.
    if (c.req.query("thumb") && file.thumbPath) {
      return new Response(Bun.file(file.thumbPath), {
        headers: {
          "content-type": "image/jpeg",
          "content-security-policy": "sandbox",
          "x-content-type-options": "nosniff",
          "cache-control": "private, max-age=31536000, immutable",
        },
      });
    }
    // Photos show in the page; everything else is a download that cannot run in this origin.
    const inline = INLINE_TYPES.includes(file.type);
    return new Response(Bun.file(file.path), {
      headers: {
        "content-type": inline ? file.type : "application/octet-stream",
        "content-length": String(file.size),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "content-security-policy": "sandbox",
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=31536000, immutable",
      },
    });
  });

  /** Where a mail (or its thread) was discussed, in the channels one sees. */
  app.get("/discussed", async (c) => {
    const ref = c.req.query("ref");
    if (!ref) return c.json({ error: "Angaben unvollständig." }, 400);
    const viewer = c.get("viewer");
    const found = await messages.discussed(ref, c.req.query("thread") || null);
    const seen = await Promise.all(found.map((item) => visible(item.channelId, viewer)));
    return c.json({ discussions: found.filter((_, index) => seen[index]) });
  });

  /** Channels one sees where mails of this sender were discussed: the first suggestions. */
  app.get("/suggestions", async (c) => {
    const viewer = c.get("viewer");
    const ids = await messages.channelsOfParty(c.req.query("party") ?? "");
    const seen = await Promise.all(ids.map((id) => visible(id, viewer)));
    return c.json({ channelIds: ids.filter((_, index) => seen[index]) });
  });

  app.route("/", createThreadRoutes({ store, messages, hub }));

  return app;
};
