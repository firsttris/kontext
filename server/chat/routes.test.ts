import { describe, expect, it } from "vitest";
import type { SessionAccount } from "../categories/routes";
import { createHub, type LiveEvent } from "../live/hub";
import { type Channel, canSee, directKey, type Message } from "./chat";
import { createChatRoutes } from "./routes";
import type { ChatStore } from "./store";

/** The store in memory, enough for the routes. */
const memoryStore = (): ChatStore => {
  const channels: Channel[] = [];
  const messages: Message[] = [];
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
        .map((channel) => ({ ...channel, unread: 0, mentions: 0, readAt: null, last: null })),
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
    messages: async (channelId) => messages.filter((m) => m.channelId === channelId).reverse(),
    post: async (channelId, authorId, text, mentions) => {
      const message = {
        id: `m${messages.length + 1}`,
        channelId,
        authorId,
        text,
        mentions,
        createdAt: new Date().toISOString(),
      };
      messages.push(message);
      return message;
    },
    markRead: async (channelId, memberId, at) => {
      reads[channelId] = { ...reads[channelId], [memberId]: at.toISOString() };
      return at;
    },
    reads: async (channelId) => reads[channelId] ?? {},
  };
};

const person = (id: string, shared: string[] = []): SessionAccount[] => [
  { id, isReadOnly: false, isPersonal: true },
  ...shared.map((account) => ({ id: account, isReadOnly: false, isPersonal: false })),
];

const setup = () => {
  const hub = createHub();
  let signedIn: SessionAccount[] | null = person("jonas", ["info"]);
  const app = createChatRoutes({ store: memoryStore(), hub, accountsOf: async () => signedIn });
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
      body: (await response.json()) as { channel: Channel; messages: Message[] },
    };
  };
  const listen = (me: string, accountIds: string[] = [me]) => {
    const heard: LiveEvent[] = [];
    hub.subscribe({ me, accountIds }, (event) => heard.push(event));
    return heard;
  };
  return { send, as, listen };
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
});
