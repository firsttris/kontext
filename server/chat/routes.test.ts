// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SessionAccount } from "../categories/routes";
import { createHub, type LiveEvent } from "../live/hub";
import { type Channel, type ChatFile, canSee, directKey, type Message } from "./chat";
import type { ChatFiles, StoredFile } from "./files";
import type { MessageStore } from "./messages";
import { createChatRoutes } from "./routes";
import type { ChatStore } from "./store";

/** The store in memory, enough for the routes. */
const memoryStore = (): ChatStore => {
  const channels: Channel[] = [];
  const reads: Record<string, Record<string, string>> = {};
  const add = (channel: Omit<Channel, "id" | "createdAt" | "lastMessageAt">) => {
    const created = {
      ...channel,
      id: `c${channels.length + 1}`,
      createdAt: new Date().toISOString(),
      lastMessageAt: null,
    };
    channels.push(created);
    return created;
  };
  return {
    list: async (viewer) =>
      channels
        .filter((channel) => canSee(channel, viewer))
        .map((channel) => ({
          ...channel,
          unread: 0,
          mentions: 0,
          readAt: null,
          last: null,
          muted: false,
        })),
    get: async (id) => channels.find((channel) => channel.id === id) ?? null,
    createChannel: async (name, members, createdBy) =>
      add({ kind: "channel", name, accountId: null, members: [createdBy, ...members], createdBy }),
    direct: async (members, createdBy) => {
      const everyone = [...new Set([createdBy, ...members])];
      return (
        channels.find((c) => c.kind === "direct" && directKey(c.members) === directKey(everyone)) ??
        add({ kind: "direct", name: null, accountId: null, members: everyone, createdBy })
      );
    },
    update: async (id, patch) => {
      const channel = channels.find((c) => c.id === id);
      if (channel) Object.assign(channel, patch);
      return channel ?? null;
    },
    markRead: async (channelId, memberId, at) => {
      reads[channelId] = { ...reads[channelId], [memberId]: at.toISOString() };
      return at;
    },
    reads: async (channelId) => reads[channelId] ?? {},
    mute: async () => undefined,
    leave: async (channelId, memberId) => {
      const channel = channels.find((c) => c.id === channelId);
      if (channel) channel.members = channel.members.filter((m) => m !== memberId);
    },
    audience: async () => ({ readers: [], muted: [] }),
    remove: async (channelId) => {
      channels.splice(
        channels.findIndex((c) => c.id === channelId),
        1,
      );
    },
  };
};

const person = (id: string, shared: string[] = []): SessionAccount[] => [
  { id, isReadOnly: false, isPersonal: true },
  ...shared.map((account) => ({ id: account, isReadOnly: false, isPersonal: false })),
];

/** Messages and files in memory; a mail is "discussed" where a card with its ref or thread is. */
const memoryMessages = () => {
  const messages: Message[] = [];
  const stored: StoredFile[] = [];
  const files: ChatFiles = {
    save: async (channelId, _by, file) => {
      const saved = {
        id: `f${stored.length + 1}`,
        name: file.name,
        type: file.type,
        size: file.size,
      };
      stored.push({ ...saved, channelId, messageId: null, path: "" });
      return saved;
    },
    get: async (id) => stored.find((file) => file.id === id) ?? null,
    attach: async (ids, message) => {
      const attached: ChatFile[] = [];
      for (const file of stored) {
        if (!ids.includes(file.id) || file.channelId !== message.channelId || file.messageId) {
          continue;
        }
        file.messageId = message.id;
        attached.push({ id: file.id, name: file.name, type: file.type, size: file.size });
      }
      return attached;
    },
    ofMessages: async () => new Map(),
    pruneUnsent: async () => 0,
    removeOfMessage: async () => undefined,
    removeOfChannel: async () => undefined,
  };
  const store: MessageStore = {
    page: async (channelId) => messages.filter((m) => m.channelId === channelId).reverse(),
    post: async ({ fileIds, ...post }) => {
      const id = `m${messages.length + 1}`;
      const attached = await files.attach(fileIds, { id, ...post });
      const message = {
        ...post,
        id,
        files: attached,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        call: null,
      };
      messages.push(message);
      return message;
    },
    last: async () => new Map(),
    get: async (id) => messages.find((m) => m.id === id) ?? null,
    edit: async (id, text) => {
      const message = messages.find((m) => m.id === id)!;
      Object.assign(message, { text, editedAt: new Date().toISOString() });
      return message;
    },
    remove: async (id) => {
      const message = messages.find((m) => m.id === id)!;
      Object.assign(message, { text: "", cards: [], files: [], deleted: true });
      return message;
    },
    search: async (channelIds, words) =>
      messages.filter((m) => channelIds.includes(m.channelId) && m.text.includes(words)),
    discussed: async (ref, threadId) =>
      messages
        .filter((m) => m.cards.some((card) => card.ref === ref || card.threadId === threadId))
        .map((m) => ({
          channelId: m.channelId,
          messageId: m.id,
          createdAt: m.createdAt,
          replies: 0,
        })),
    channelsOfParty: async (party) => [
      ...new Set(
        messages
          .filter((m) => m.cards.some((card) => card.party === party))
          .map((m) => m.channelId),
      ),
    ],
  };
  return { store, files };
};

const setup = () => {
  const hub = createHub();
  let signedIn: SessionAccount[] | null = person("jonas", ["info"]);
  const memory = memoryMessages();
  const told: { who: string[]; title: string }[] = [];
  const app = createChatRoutes({
    store: memoryStore(),
    messages: memory.store,
    files: memory.files,
    hub,
    accountsOf: async () => signedIn,
    notify: async (who, notice) => {
      told.push({ who, title: notice.title });
    },
    nameOf: async () => "Jonas Weber",
  });
  const as = (accounts: SessionAccount[] | null) => {
    signedIn = accounts;
  };
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      body: (await response.json()) as {
        channel: Channel;
        message: Message;
        messages: Message[];
        discussions: { channelId: string }[];
        channelIds: string[];
      },
    };
  };
  const listen = (me: string, accountIds: string[] = [me]) => {
    const heard: LiveEvent[] = [];
    hub.subscribe({ me, accountIds }, (event) => heard.push(event));
    return heard;
  };
  const upload = async (channelId: string, name: string) => {
    const form = new FormData();
    form.append("file", new File(["jpeg"], name, { type: "image/jpeg" }));
    const response = await app.request(`/channels/${channelId}/files`, {
      method: "POST",
      body: form,
    });
    return { status: response.status, body: (await response.json()) as { file: ChatFile } };
  };
  return { send, as, listen, upload, app, told };
};

describe("/api/chat", () => {
  it("needs a signed-in person", async () => {
    const { send, as } = setup();
    as(null);
    expect((await send("GET", "/channels")).status).toBe(401);
  });

  it("keeps a channel to its members", async () => {
    const { send, as } = setup();
    const { body } = await send("POST", "/channels", {
      name: "Baustelle Hoffmann",
      members: ["max"],
    });
    expect(body.channel).toMatchObject({ name: "baustelle-hoffmann", members: ["jonas", "max"] });
    const path = `/channels/${body.channel.id}/messages`;
    expect((await send("POST", path, { text: "Rohr bestellt." })).status).toBe(201);

    as(person("max"));
    expect((await send("GET", path)).body.messages).toHaveLength(1);
    as(person("anna"));
    expect((await send("GET", path)).status).toBe(404);
    expect((await send("POST", path, { text: "Hallo?" })).status).toBe(404);
  });

  it("finds the same direct conversation again", async () => {
    const { send, as } = setup();
    const first = (await send("POST", "/direct", { members: ["anna"] })).body.channel;
    as(person("anna"));
    const again = (await send("POST", "/direct", { members: ["jonas"] })).body.channel;
    expect(again.id).toBe(first.id);
  });

  it("sends a message live to those who see the channel, typing not to oneself", async () => {
    const { send, listen } = setup();
    const max = listen("max");
    const anna = listen("anna");
    const jonas = listen("jonas");
    const { body } = await send("POST", "/channels", { name: "angebote", members: ["max"] });
    await send("POST", `/channels/${body.channel.id}/messages`, {
      text: "@Max Angebot ist raus",
      mentions: ["max"],
    });
    await send("POST", `/channels/${body.channel.id}/typing`);
    const types = (heard: LiveEvent[]) =>
      heard.map((event) => event.type).filter((type) => type !== "presence");
    expect(types(max)).toEqual(["channels", "message", "typing"]);
    expect(anna.some((event) => event.type === "message")).toBe(false);
    expect(jonas.some((event) => event.type === "typing")).toBe(false);
  });

  it("refuses an empty message and changing #allgemein-like channels", async () => {
    const { send } = setup();
    const { body } = await send("POST", "/direct", { members: ["anna"] });
    expect(
      (await send("POST", `/channels/${body.channel.id}/messages`, { text: "  " })).status,
    ).toBe(400);
    expect((await send("PATCH", `/channels/${body.channel.id}`, { name: "x" })).status).toBe(403);
  });
  it("sends photos and a mail as a card; the mail knows where it was discussed", async () => {
    const { send, as, upload, app } = setup();
    const { body } = await send("POST", "/channels", { name: "baustelle", members: ["max"] });
    const channel = body.channel.id;
    const photo = await upload(channel, "abfluss.jpg");
    expect(photo.status).toBe(201);
    const card = {
      kind: "mail",
      accountId: "info",
      ref: "e1",
      threadId: "t1",
      party: "markus@hoffmann.test",
      label: "Re: Badsanierung",
    };
    const posted = await send("POST", `/channels/${channel}/messages`, {
      fileIds: [photo.body.file.id],
      cards: [card],
    });
    expect(posted.status).toBe(201);
    expect(posted.body.message.files.map((file) => file.name)).toEqual(["abfluss.jpg"]);
    expect(posted.body.message.cards[0]).toMatchObject({ ref: "e1", detail: "" });

    expect((await send("GET", "/discussed?ref=e2&thread=t1")).body.discussions).toHaveLength(1);
    expect((await send("GET", "/suggestions?party=markus@hoffmann.test")).body.channelIds).toEqual([
      channel,
    ]);
    // Anna is not in the channel: she does not learn of it, nor gets its photo.
    as(person("anna", ["info"]));
    expect((await send("GET", "/discussed?ref=e1")).body.discussions).toEqual([]);
    expect((await app.request(`/files/${photo.body.file.id}`)).status).toBe(404);
    expect((await upload(channel, "x.jpg")).status).toBe(404);
  });

  it("refuses a message with neither text nor anything in it", async () => {
    const { send } = setup();
    const { body } = await send("POST", "/direct", { members: ["anna"] });
    expect((await send("POST", `/channels/${body.channel.id}/messages`, {})).status).toBe(400);
  });
  it("lets only the author edit or delete a message, live for the others", async () => {
    const { send, as, listen } = setup();
    const { body } = await send("POST", "/channels", { name: "angebote", members: ["max"] });
    const posted = await send("POST", `/channels/${body.channel.id}/messages`, {
      text: "Angebt raus",
    });
    const id = posted.body.message.id;
    const max = listen("max");
    expect(
      (await send("PATCH", `/messages/${id}`, { text: "Angebot raus" })).body.message.text,
    ).toBe("Angebot raus");
    as(person("max"));
    expect((await send("PATCH", `/messages/${id}`, { text: "Hack" })).status).toBe(404);
    expect((await send("DELETE", `/messages/${id}`)).status).toBe(404);
    as(person("jonas", ["info"]));
    expect((await send("DELETE", `/messages/${id}`)).body.message.deleted).toBe(true);
    expect((await send("PATCH", `/messages/${id}`, { text: "wieder da" })).status).toBe(404);
    expect(max.filter((event) => event.type === "changed")).toHaveLength(2);
  });

  it("searches only in channels one sees", async () => {
    const { send, as } = setup();
    const { body } = await send("POST", "/channels", { name: "intern", members: [] });
    await send("POST", `/channels/${body.channel.id}/messages`, { text: "Gehalt Max" });
    expect((await send("GET", "/search?q=Gehalt")).body.messages).toHaveLength(1);
    as(person("max"));
    expect((await send("GET", "/search?q=Gehalt")).body.messages).toEqual([]);
  });

  it("lets members leave a channel and only its maker delete it", async () => {
    const { send, as } = setup();
    const { body } = await send("POST", "/channels", { name: "kurz", members: ["max"] });
    const path = `/channels/${body.channel.id}`;
    as(person("max"));
    expect((await send("DELETE", path)).status).toBe(403);
    expect((await send("POST", `${path}/leave`)).status).toBe(200);
    expect((await send("GET", `${path}/messages`)).status).toBe(404);
    as(person("jonas", ["info"]));
    expect((await send("DELETE", path)).status).toBe(200);
    expect((await send("GET", `${path}/messages`)).status).toBe(404);
  });
  it("tells the other in a direct conversation and the mentioned in a channel", async () => {
    const { send, told } = setup();
    const direct = (await send("POST", "/direct", { members: ["sandra"] })).body.channel;
    await send("POST", `/channels/${direct.id}/messages`, { text: "Ruf mal an" });
    const channel = (await send("POST", "/channels", { name: "lager", members: ["max", "anna"] }))
      .body.channel;
    await send("POST", `/channels/${channel.id}/messages`, { text: "Hallo alle" });
    await send("POST", `/channels/${channel.id}/messages`, { text: "@Max", mentions: ["max"] });
    await expect.poll(() => told.length).toBe(2);
    expect(told).toEqual([
      { who: ["sandra"], title: "Jonas Weber" },
      { who: ["max"], title: "Jonas Weber in #lager" },
    ]);
  });
});
