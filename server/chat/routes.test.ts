// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SessionAccount } from "../categories/routes";
import { createHub, type LiveEvent } from "../live/hub";
import type { Channel, ChatFile, Message } from "./chat";
import { createMemoryChat } from "./memory-store";
import { createChatRoutes } from "./routes";

const person = (id: string, shared: string[] = []): SessionAccount[] => [
  { id, isReadOnly: false, isPersonal: true },
  ...shared.map((account) => ({ id: account, isReadOnly: false, isPersonal: false })),
];

const setup = () => {
  const hub = createHub();
  let signedIn: SessionAccount[] | null = person("jonas", ["info"]);
  const memory = createMemoryChat();
  const told: { who: string[]; title: string }[] = [];
  const bodies: string[] = [];
  const app = createChatRoutes({
    store: memory.store,
    messages: memory.messages,
    files: memory.files,
    hub,
    accountsOf: async () => signedIn,
    notify: async (who, notice) => {
      told.push({ who, title: notice.title });
      bodies.push(notice.body);
    },
    nameOf: async () => "Jonas Weber",
    publicKeyOf: async (id) =>
      ["jonas", "anna"].includes(id)
        ? { publicKey: `KEY-${id}`, email: `${id}@weber.test`, fingerprint: `FP-${id}` }
        : null,
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
  return {
    send,
    as,
    listen,
    upload,
    app,
    told,
    bodies,
    removedChannels: memory.removedChannels,
  };
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

  it("keeps a voice message as audio, whatever type its name gives it", async () => {
    const { send, app } = setup();
    const { body } = await send("POST", "/direct", { members: ["anna"] });
    const upload = async (name: string, type: string, kind?: string) => {
      const form = new FormData();
      // Bun reads ".webm" as video (server/chat/chat.ts voiceType).
      form.append("file", new File(["opus"], name, { type }));
      if (kind) form.append("kind", kind);
      const response = await app.request(`/channels/${body.channel.id}/files`, {
        method: "POST",
        body: form,
      });
      return ((await response.json()) as { file: ChatFile }).file.type;
    };
    expect(await upload("Sprachnachricht.webm", "video/webm", "voice")).toBe("audio/webm");
    expect(await upload("Sprachnachricht.m4a", "audio/x-m4a", "voice")).toBe("audio/mp4");
    expect(await upload("film.webm", "video/webm")).toBe("video/webm");
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

  it("takes a channel's files with it when the last member leaves", async () => {
    const { send, as, upload, removedChannels } = setup();
    const { body } = await send("POST", "/channels", { name: "baustelle", members: ["max"] });
    const path = `/channels/${body.channel.id}`;
    const photo = await upload(body.channel.id, "angebot.jpg");
    await send("POST", `${path}/messages`, { text: "Hier", fileIds: [photo.body.file.id] });
    as(person("max"));
    expect((await send("POST", `${path}/leave`)).status).toBe(200);
    // Jonas is still in it: the files stay.
    expect(removedChannels).toEqual([]);
    as(person("jonas", ["info"]));
    expect((await send("POST", `${path}/leave`)).status).toBe(200);
    // Nobody is left: with the channel go the bytes of its files, as when it is deleted.
    expect(removedChannels).toEqual([body.channel.id]);
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

  it("answers in a thread: not in the channel, the first message counts them", async () => {
    const { send, as, listen, told } = setup();
    const channel = (await send("POST", "/channels", { name: "lager", members: ["max", "anna"] }))
      .body.channel;
    const path = `/channels/${channel.id}/messages`;
    const first = (await send("POST", path, { text: "Wer holt das Rohr?" })).body.message;
    const heard = listen("anna");
    as(person("max"));
    const answer = await send("POST", path, { text: "Ich", parentId: first.id });
    expect(answer.status).toBe(201);
    expect(answer.body.message.parentId).toBe(first.id);
    // No answers to answers, none into another channel.
    expect((await send("POST", path, { text: "x", parentId: answer.body.message.id })).status).toBe(
      404,
    );
    expect((await send("GET", path)).body.messages.map((m) => m.id)).toEqual([first.id]);
    const thread = await send("GET", `/messages/${first.id}/replies`);
    expect((thread.body as unknown as { replies: Message[] }).replies.map((m) => m.text)).toEqual([
      "Ich",
    ]);
    expect(heard.map((event) => event.type).filter((type) => type !== "presence")).toEqual([
      "message",
      "changed",
    ]);
    // Jonas wrote the first message: he hears of the answer.
    await expect.poll(() => told.length).toBe(1);
    expect(told[0]).toEqual({ who: ["jonas"], title: "Jonas Weber antwortet in #lager" });
    as(person("sandra"));
    expect((await send("GET", `/messages/${first.id}/replies`)).status).toBe(404);
  });

  it("shows an answer in the channel too when asked, marked as one, in its thread as well", async () => {
    const { send, as } = setup();
    const channel = (await send("POST", "/channels", { name: "lager", members: ["max"] })).body
      .channel;
    const path = `/channels/${channel.id}/messages`;
    const first = (await send("POST", path, { text: "Wer holt das Rohr?" })).body.message;
    as(person("max"));
    const quiet = (await send("POST", path, { text: "Vielleicht", parentId: first.id })).body
      .message;
    const loud = await send("POST", path, {
      text: "Ich, um 14 Uhr",
      parentId: first.id,
      alsoInChannel: true,
    });
    expect(loud.status).toBe(201);
    expect(loud.body.message).toMatchObject({ parentId: first.id, alsoInChannel: true });
    expect(quiet.alsoInChannel).toBe(false);
    // In the channel: the first message and the loud answer, not the quiet one.
    expect((await send("GET", path)).body.messages.map((m) => m.text)).toEqual([
      "Ich, um 14 Uhr",
      "Wer holt das Rohr?",
    ]);
    const thread = await send("GET", `/messages/${first.id}/replies`);
    expect((thread.body as unknown as { replies: Message[] }).replies.map((m) => m.text)).toEqual([
      "Vielleicht",
      "Ich, um 14 Uhr",
    ]);
    // Without a thread the flag means nothing.
    const plain = (await send("POST", path, { text: "Danke", alsoInChannel: true })).body.message;
    expect(plain.alsoInChannel).toBe(false);
  });

  it("puts reactions on and off, live for the others", async () => {
    const { send, as, listen } = setup();
    const channel = (await send("POST", "/channels", { name: "lager", members: ["max"] })).body
      .channel;
    const message = (
      await send("POST", `/channels/${channel.id}/messages`, { text: "Rohr ist da" })
    ).body.message;
    const heard = listen("max");
    const react = (emoji: string, on: boolean) =>
      send("POST", `/messages/${message.id}/reactions`, { emoji, on });
    expect((await react("👍", true)).body.message.reactions).toEqual([
      { emoji: "👍", members: ["jonas"] },
    ]);
    as(person("max"));
    await react("👍", true);
    expect((await react("🎉", true)).body.message.reactions).toEqual([
      { emoji: "👍", members: ["jonas", "max"] },
      { emoji: "🎉", members: ["max"] },
    ]);
    expect((await react("🎉", false)).body.message.reactions).toHaveLength(1);
    expect((await react("hallo", true)).status).toBe(400);
    expect((await react("12", true)).status).toBe(400);
    expect(heard.filter((event) => event.type === "changed")).toHaveLength(4);
    as(person("anna"));
    expect((await react("👍", true)).status).toBe(404);
  });

  it("keeps confidential channels to members with a key, and to encrypted text", async () => {
    const { send, told, bodies } = setup();
    const refused = await send("POST", "/direct", { members: ["max"], confidential: true });
    expect(refused.status).toBe(400);
    expect((refused.body as unknown as { missing: string[] }).missing).toEqual(["max"]);
    const plain = (await send("POST", "/direct", { members: ["anna"] })).body.channel;
    const sealed = (await send("POST", "/direct", { members: ["anna"], confidential: true })).body
      .channel;
    expect(sealed.confidential).toBe(true);
    expect(sealed.id).not.toBe(plain.id);
    const keys = await send("GET", `/channels/${sealed.id}/keys`);
    expect(
      (keys.body as unknown as { keys: { memberId: string }[] }).keys.map((k) => k.memberId),
    ).toEqual(["jonas", "anna"]);
    expect((keys.body as unknown as { keys: object[] }).keys[1]).toMatchObject({
      memberId: "anna",
      email: "anna@weber.test",
      fingerprint: "FP-anna",
    });
    const path = `/channels/${sealed.id}/messages`;
    expect((await send("POST", path, { text: "Gehalt: 4.200 Euro" })).status).toBe(400);
    const armored = "-----BEGIN PGP MESSAGE-----\n\nwcBMA…\n-----END PGP MESSAGE-----";
    const posted = await send("POST", path, { text: armored });
    expect(posted.status).toBe(201);
    expect(told.at(-1)?.who).toEqual(["anna"]);
    expect(bodies.at(-1)).toBe("Vertrauliche Nachricht");
    expect(
      (await send("PATCH", `/messages/${posted.body.message.id}`, { text: "jetzt lesbar" })).status,
    ).toBe(400);
    // An answer shown in the channel too: still only encrypted text.
    const answer = { parentId: posted.body.message.id, alsoInChannel: true };
    expect((await send("POST", path, { ...answer, text: "Danke" })).status).toBe(400);
    const sealedAnswer = await send("POST", path, { ...answer, text: armored });
    expect(sealedAnswer.status).toBe(201);
    expect(sealedAnswer.body.message.alsoInChannel).toBe(true);
  });

  it("takes only encrypted files in a confidential channel, without their names", async () => {
    const { send, app } = setup();
    const plain = (await send("POST", "/direct", { members: ["anna"] })).body.channel;
    const sealed = (await send("POST", "/direct", { members: ["anna"], confidential: true })).body
      .channel;
    const upload = (channelId: string, bytes: number[], kind?: string) => {
      const form = new FormData();
      form.append("file", new File([new Uint8Array(bytes)], "Gehaltsliste.pdf"));
      if (kind) form.append("kind", kind);
      return app.request(`/channels/${channelId}/files`, { method: "POST", body: form });
    };
    expect((await upload(sealed.id, [0x25, 0x50, 0x44, 0x46])).status).toBe(400);
    expect((await upload(sealed.id, [0x25, 0x50], "sealed")).status).toBe(400);
    expect((await upload(plain.id, [0xc1, 0x01], "sealed")).status).toBe(400);
    const done = await upload(sealed.id, [0xc1, 0x01, 0x02], "sealed");
    expect(done.status).toBe(201);
    const { file } = (await done.json()) as { file: { id: string; name: string; type: string } };
    expect(file).toMatchObject({ name: "verschlüsselt", type: "application/vnd.kontext.sealed" });
    const armored = "-----BEGIN PGP MESSAGE-----\n\nwcBMA…\n-----END PGP MESSAGE-----";
    const posted = await send("POST", `/channels/${sealed.id}/messages`, {
      text: armored,
      fileIds: [file.id],
    });
    expect(posted.status).toBe(201);
    expect(posted.body.message.files).toHaveLength(1);
    // A file that went up readable (in another channel) does not go into a confidential one.
    const open = await upload(plain.id, [0x25, 0x50]);
    const openId = ((await open.json()) as { file: { id: string } }).file.id;
    expect(
      (await send("POST", `/channels/${sealed.id}/messages`, { text: armored, fileIds: [openId] }))
        .status,
    ).toBe(400);
  });
});
