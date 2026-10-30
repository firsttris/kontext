// @vitest-environment node
import { describe, expect, it } from "vitest";
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
