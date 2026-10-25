import { describe, expect, it } from "vitest";
import {
  canSee,
  channelLabel,
  channelName,
  chatNotice,
  directKey,
  fold,
  messageSummary,
  newChannelSchema,
  notifyWho,
  reactionSchema,
  retentionCutoff,
  retentionSchema,
  toggleReaction,
} from "./chat";

const jonas = { me: "jonas", accountIds: ["jonas", "info"] };
const max = { me: "max", accountIds: ["max"] };

describe("canSee", () => {
  it("shows #allgemein to everyone", () => {
    expect(canSee({ kind: "team", accountId: null, members: [] }, max)).toBe(true);
  });

  it("shows a mailbox channel to whoever can open the mailbox", () => {
    const info = { kind: "mailbox" as const, accountId: "info", members: [] };
    expect(canSee(info, jonas)).toBe(true);
    expect(canSee(info, max)).toBe(false);
  });

  it("shows named and direct channels to their members only", () => {
    const direct = { kind: "direct" as const, accountId: null, members: ["jonas", "anna"] };
    expect(canSee(direct, jonas)).toBe(true);
    expect(canSee(direct, max)).toBe(false);
  });
});

describe("channelName", () => {
  it("makes a short name with dashes", () => {
    expect(channelName("  #Baustelle Hoffmann ")).toBe("baustelle-hoffmann");
    expect(channelName("Bad_OG: Fliesen!")).toBe("bad-og-fliesen");
    expect(channelName("Größe – Übersicht")).toBe("größe-übersicht");
  });

  it("refuses a name without letters", () => {
    expect(newChannelSchema.safeParse({ name: " # ! ", members: [] }).success).toBe(false);
  });
});

describe("directKey", () => {
  it("is the same for the same people in any order", () => {
    expect(directKey(["b", "a", "b"])).toBe(directKey(["a", "b"]));
  });
});

describe("notifyWho", () => {
  const message = { authorId: "jonas", mentions: ["max", "anna", "jonas"] };
  const none = { readers: [], muted: [] };

  it("tells the others in a direct conversation, mentioned or not", () => {
    expect(
      notifyWho(
        { kind: "direct", members: ["jonas", "sandra"] },
        { ...message, mentions: [] },
        none,
      ),
    ).toEqual(["sandra"]);
  });

  it("tells mentioned members of a channel only, never the author", () => {
    expect(notifyWho({ kind: "channel", members: ["jonas", "max"] }, message, none)).toEqual([
      "max",
    ]);
    expect(notifyWho({ kind: "team", members: [] }, message, none)).toEqual(["max", "anna"]);
  });

  it("in a mailbox channel only who has read in it, and nobody who muted it", () => {
    expect(
      notifyWho({ kind: "mailbox", members: [] }, message, {
        readers: ["anna", "max"],
        muted: ["max"],
      }),
    ).toEqual(["anna"]);
  });
});

describe("chatNotice", () => {
  it("names who wrote and where, and leads to the message", () => {
    const channel = { id: "c1", kind: "channel" as const };
    const message = { id: "m1", text: "Rohr bestellen", files: [], cards: [] };
    expect(chatNotice(channel, message, "Jonas Weber", "#baustelle")).toEqual({
      title: "Jonas Weber in #baustelle",
      body: "Rohr bestellen",
      url: "/chat?channel=c1&message=m1",
      tag: "chat-c1",
    });
    expect(chatNotice({ id: "d", kind: "direct" }, message, "Sandra Klein", "").title).toBe(
      "Sandra Klein",
    );
    expect(
      channelLabel({ kind: "mailbox", name: null, accountId: "i" }, () => "info@weber.test"),
    ).toBe("info@");
  });
});

describe("messageSummary of a call", () => {
  const line = (durationS: number | null, meeting = false, video = false) =>
    messageSummary({
      text: "",
      files: [],
      cards: [],
      call: { video, meeting, participants: ["jonas"], durationS },
    });

  it("names missed calls, calls, video calls and meetings", () => {
    expect(line(null)).toBe("Verpasster Anruf");
    expect(line(60)).toBe("Anruf");
    expect(line(60, false, true)).toBe("Videoanruf");
    expect(line(60, true, true)).toBe("Besprechung");
  });
});

describe("reactions, search, keeping", () => {
  it("adds and takes away one person's emoji, in the order they came", () => {
    let list = toggleReaction([], "👍", "jonas", true);
    list = toggleReaction(list, "🎉", "max", true);
    list = toggleReaction(list, "👍", "max", true);
    list = toggleReaction(list, "👍", "max", true);
    expect(list).toEqual([
      { emoji: "👍", members: ["jonas", "max"] },
      { emoji: "🎉", members: ["max"] },
    ]);
    expect(toggleReaction(list, "🎉", "max", false)).toEqual([
      { emoji: "👍", members: ["jonas", "max"] },
    ]);
  });

  it("takes emojis with skin tone or joined, not words or digits", () => {
    const ok = (emoji: string) => reactionSchema.safeParse({ emoji, on: true }).success;
    expect(["👍", "👍🏽", "❤️", "👩‍🔧", "✅"].every(ok)).toBe(true);
    expect(["ok", "12", "#", "", "👍 ok"].some(ok)).toBe(false);
  });

  it("folds umlauts for the search", () => {
    expect(fold("ÖLWECHSEL Übergabe Straße")).toBe("ölwechsel übergabe straße");
  });

  it("keeps for ever with 0 days, else cuts off by the days", () => {
    const now = new Date("2026-10-25T12:00:00Z");
    expect(retentionCutoff(0, now)).toBeNull();
    expect(retentionCutoff(30, now)?.toISOString()).toBe("2026-09-25T12:00:00.000Z");
    expect(retentionSchema.safeParse({ days: 365 }).success).toBe(true);
    expect(retentionSchema.safeParse({ days: 7 }).success).toBe(false);
  });

  it("tells who wrote in the thread of an answer, and leads into it", () => {
    const channel = { kind: "channel" as const, members: ["jonas", "max", "anna"] };
    const who = notifyWho(channel, { authorId: "max", mentions: [] }, { readers: [], muted: [] }, [
      "jonas",
      "max",
    ]);
    expect(who).toEqual(["jonas"]);
    const notice = chatNotice(
      { id: "c1", kind: "channel" },
      { id: "m2", text: "Ich", files: [], cards: [], parentId: "m1" },
      "Max",
      "#lager",
    );
    expect(notice.title).toBe("Max antwortet in #lager");
    expect(notice.url).toBe("/chat?channel=c1&message=m1&thread=m1");
  });
});
