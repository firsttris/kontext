import { describe, expect, it } from "vitest";
import type { Message } from "../../server/chat/chat";
import { hasNewReplies, newestActivity, reactionNames, retentionText } from "./chat-threads";

const message = (id: string, createdAt: string, patch: Partial<Message> = {}): Message => ({
  id,
  channelId: "c",
  parentId: null,
  authorId: "max",
  text: "Hallo",
  mentions: [],
  files: [],
  cards: [],
  createdAt,
  editedAt: null,
  deleted: false,
  call: null,
  reactions: [],
  replies: null,
  ...patch,
});

describe("threads", () => {
  const answered = message("a", "2026-10-25T08:00:00Z", {
    replies: { count: 2, lastAt: "2026-10-25T10:00:00Z", people: ["anna"] },
  });

  it("an answer later than the last message counts as the newest", () => {
    expect(newestActivity([answered, message("b", "2026-10-25T09:00:00Z")])).toBe(
      "2026-10-25T10:00:00Z",
    );
    expect(newestActivity([])).toBeUndefined();
  });

  it("marks answers from others since one read", () => {
    expect(hasNewReplies(answered, "jonas", "2026-10-25T09:00:00Z")).toBe(true);
    expect(hasNewReplies(answered, "jonas", "2026-10-25T11:00:00Z")).toBe(false);
    expect(hasNewReplies(answered, "anna", "2026-10-25T09:00:00Z")).toBe(false);
  });
});

describe("reactions and keeping", () => {
  const nameOf = (id: string) => ({ max: "Max", anna: "Anna", lea: "Lea" })[id] ?? id;
  it("names who reacted, oneself first", () => {
    expect(reactionNames({ emoji: "👍", members: ["max"] }, "jonas", nameOf)).toBe("Max");
    expect(reactionNames({ emoji: "👍", members: ["max", "jonas"] }, "jonas", nameOf)).toBe(
      "Du und Max",
    );
    expect(
      reactionNames({ emoji: "👍", members: ["max", "anna", "lea", "jonas"] }, "jonas", nameOf),
    ).toBe("Du, Max und 2 weitere");
  });

  it("says the time in days, months or years", () => {
    expect(retentionText(30)).toBe("30 Tage");
    expect(retentionText(90)).toBe("3 Monate");
    expect(retentionText(365)).toBe("1 Jahr");
    expect(retentionText(1825)).toBe("5 Jahre");
  });
});
