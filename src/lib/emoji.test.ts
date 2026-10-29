import { describe, expect, it } from "vitest";
import { isOneEmoji } from "../../server/chat/chat";
import { EMOJI_CATEGORIES, emojiName, parseEmojis, searchEmojis } from "./emoji";

describe("emoji lists", () => {
  it("reads an emoji with its English and German words", () => {
    expect(parseEmojis("\n👍 thumbs up, like | Daumen hoch, gut\n")).toEqual([
      { emoji: "👍", en: ["thumbs up", "like"], de: ["daumen hoch", "gut"] },
    ]);
  });

  it("offers only what the server takes as one emoji, each once, each with both names", () => {
    const all = EMOJI_CATEGORIES.flatMap((category) => category.emojis);
    expect(all.length).toBeGreaterThan(300);
    expect(all.filter((entry) => !isOneEmoji(entry.emoji))).toEqual([]);
    expect(new Set(all.map((entry) => entry.emoji)).size).toBe(all.length);
    expect(all.filter((entry) => !entry.en.length || !entry.de.length)).toEqual([]);
  });

  it("names it in the app's language", () => {
    const [thumbs] = parseEmojis("👍 thumbs up | daumen hoch");
    expect(emojiName(thumbs!, "de")).toBe("daumen hoch");
    expect(emojiName(thumbs!, "en")).toBe("thumbs up");
  });
});

describe("searchEmojis", () => {
  const found = (query: string) => searchEmojis(query).map((entry) => entry.emoji);

  it("finds by German or English words, also by their start", () => {
    expect(found("daumen ho")).toEqual(["👍"]);
    expect(found("thumbs")).toEqual(expect.arrayContaining(["👍", "👎"]));
    expect(found("schraub")).toEqual(expect.arrayContaining(["🔧", "🪛", "🔩"]));
  });

  it("takes umlauts typed without them, and puts the name before other words", () => {
    expect(found("baer")).toContain("🐻");
    expect(found("fussball")).toContain("⚽");
    expect(found("herz")[0]).toBe("❤️");
  });

  it("finds nothing for nothing", () => {
    expect(found("")).toEqual([]);
    expect(found("xyzzy")).toEqual([]);
  });
});
