// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Card } from "./chat";
import { createMemoryChat } from "./memory-store";

const jonas = { me: "jonas", accountIds: ["jonas", "info"] };

describe("createMemoryChat", () => {
  it("has #allgemein and the shared mailboxes' channels, and counts what others wrote", async () => {
    let now = Date.parse("2026-10-30T08:00:00Z");
    const tick = () => {
      now += 1000;
      return new Date(now);
    };
    const chat = createMemoryChat(tick);
    const first = await chat.store.list(jonas, ["info"]);
    expect(first.map((c) => c.kind)).toEqual(["team", "mailbox"]);
    await chat.store.markRead("team", "jonas", new Date(now));
    await chat.messages.post({
      channelId: "team",
      authorId: "anna",
      text: "Hallo @Jonas",
      mentions: ["jonas"],
      cards: [],
      fileIds: [],
    });
    const [team] = await chat.store.list(jonas, ["info"]);
    expect(team).toMatchObject({ unread: 1, mentions: 1, last: { authorId: "anna" } });
  });
});

const post = (
  text: string,
  extra: Partial<Parameters<ReturnType<typeof createMemoryChat>["messages"]["post"]>[0]> = {},
) => ({
  channelId: "team",
  authorId: "anna",
  text,
  mentions: [],
  cards: [],
  fileIds: [],
  ...extra,
});

const card = (fields: Partial<Card> & Pick<Card, "kind" | "ref">): Card => ({
  accountId: "info",
  threadId: null,
  party: "",
  label: fields.ref,
  detail: "",
  ...fields,
});

/** A clock that moves on by a second at each look. */
const ticking = () => {
  let now = Date.parse("2026-10-30T08:00:00Z");
  return () => new Date((now += 1000));
};

describe("createMemoryChat, as the SQLite stores (store.ts, messages.ts, files.ts)", () => {
  it("gives messages written in the same millisecond their own moment, so paging loses none", async () => {
    const fixed = new Date("2026-10-30T08:00:00Z");
    const chat = createMemoryChat(() => fixed);
    for (let i = 0; i < 6; i++) await chat.messages.post(post(`Nachricht ${i}`));
    const seen: string[] = [];
    let before: Date | null = null;
    for (;;) {
      const page = await chat.messages.page("team", before, 2);
      if (!page.length) break;
      seen.push(...page.map((m) => m.text));
      before = new Date(page.at(-1)!.createdAt);
    }
    expect(seen).toHaveLength(6);
  });

  it("finds a mail without a thread by its ref only, not every card without a thread", async () => {
    const chat = createMemoryChat(ticking());
    await chat.messages.post(post("Aufgabe", { cards: [card({ kind: "task", ref: "t1" })] }));
    expect(await chat.messages.discussed("mail-1", null)).toEqual([]);
  });

  it("finds the channels of a sender whatever the case of the address", async () => {
    const chat = createMemoryChat(ticking());
    await chat.messages.post(
      post("Mail", { cards: [card({ kind: "mail", ref: "m1", party: "Hoffmann@Example.de" })] }),
    );
    expect(await chat.messages.channelsOfParty("hoffmann@example.de")).toEqual(["team"]);
  });

  it("keeps file ids apart after a channel's files went", async () => {
    const chat = createMemoryChat(ticking());
    const file = (name: string) => new File([name], name, { type: "text/plain" });
    await chat.files.save("c1", "anna", file("a.txt"));
    const kept = await chat.files.save("c2", "anna", file("b.txt"));
    await chat.files.removeOfChannel("c1");
    const later = await chat.files.save("c2", "anna", file("c.txt"));
    expect(later.id).not.toBe(kept.id);
    expect((await chat.files.get(kept.id))?.name).toBe("b.txt");
  });

  it("takes a deleted message's reactions and files along", async () => {
    const chat = createMemoryChat(ticking());
    const file = await chat.files.save("team", "anna", new File(["x"], "x.txt"));
    const message = await chat.messages.post(post("Mit Datei", { fileIds: [file.id] }));
    await chat.messages.react(message.id, "jonas", "👍", true);
    const removed = await chat.messages.remove(message.id);
    expect(removed.reactions).toEqual([]);
    expect(await chat.files.get(file.id)).toBeNull();
  });

  it("leaves the channel's last moment as it is for an answer in the thread", async () => {
    const chat = createMemoryChat(ticking());
    await chat.store.list(jonas, []);
    const first = await chat.messages.post(post("Frage"));
    await chat.messages.post(post("Antwort", { parentId: first.id }));
    const [team] = await chat.store.list(jonas, []);
    expect(team!.lastMessageAt).toBe(first.createdAt);
  });
});
