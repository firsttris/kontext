/**
 * The emojis the chat's picker offers, by category, and finding one by an English or German name.
 * The lists are text (emoji-faces.ts, emoji-things.ts), parsed here. Pure.
 */
import { m } from "@/paraglide/messages";
import { FACES, FOOD, NATURE, PEOPLE } from "./emoji-faces";
import { ACTIVITIES, FLAGS, OBJECTS, SYMBOLS, TRAVEL } from "./emoji-things";

/** An emoji with its English and German words, the first of each being its name. */
export type Emoji = { emoji: string; en: string[]; de: string[] };

export type EmojiCategory = { id: string; label: () => string; emojis: Emoji[] };

const words = (list = "") =>
  list
    .split(",")
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);

/** "👍 thumbs up, like | daumen hoch, gut" → the emoji and its words, lower case. */
export const parseEmojis = (list: string): Emoji[] =>
  list
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const space = line.indexOf(" ");
      const [en, de] = line.slice(space + 1).split("|");
      return { emoji: line.slice(0, space), en: words(en), de: words(de) };
    });

/** The emoji's name in the app's language ("daumen hoch"), English where German has none. */
export const emojiName = (emoji: Emoji, locale: string): string =>
  (locale.startsWith("de") ? emoji.de[0] : emoji.en[0]) ?? emoji.en[0] ?? emoji.emoji;

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  { id: "faces", label: m.emoji_faces, emojis: parseEmojis(FACES) },
  { id: "people", label: m.emoji_people, emojis: parseEmojis(PEOPLE) },
  { id: "nature", label: m.emoji_nature, emojis: parseEmojis(NATURE) },
  { id: "food", label: m.emoji_food, emojis: parseEmojis(FOOD) },
  { id: "activities", label: m.emoji_activities, emojis: parseEmojis(ACTIVITIES) },
  { id: "travel", label: m.emoji_travel, emojis: parseEmojis(TRAVEL) },
  { id: "objects", label: m.emoji_objects, emojis: parseEmojis(OBJECTS) },
  { id: "symbols", label: m.emoji_symbols, emojis: parseEmojis(SYMBOLS) },
  { id: "flags", label: m.emoji_flags, emojis: parseEmojis(FLAGS) },
];

/** Umlauts and ß as typed without them: "fussball" finds "fußball", "baer" finds "bär". */
const fold = (text: string) =>
  text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");

/**
 * The emojis whose English or German words start with each word of the query ("daumen ho" and
 * "thumbs" find 👍): those named so first, then those whose name starts so; at most `limit`.
 */
export const searchEmojis = (
  query: string,
  categories: EmojiCategory[] = EMOJI_CATEGORIES,
  limit = 64,
): Emoji[] => {
  const terms = fold(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const seen = new Set<string>();
  const found: { emoji: Emoji; rank: number }[] = [];
  for (const emoji of categories.flatMap((category) => category.emojis)) {
    if (seen.has(emoji.emoji)) continue;
    const all = [...emoji.en, ...emoji.de];
    const parts = all.flatMap((word) => fold(word).split(/\s+/));
    if (!terms.every((term) => parts.some((part) => part.startsWith(term)))) continue;
    seen.add(emoji.emoji);
    const names = [emoji.en[0], emoji.de[0]].map((name) => fold(name ?? ""));
    const rank = names.includes(terms.join(" "))
      ? 0
      : names.some((name) => name.startsWith(terms[0]!))
        ? 1
        : 2;
    found.push({ emoji, rank });
  }
  return found
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map(({ emoji }) => emoji);
};
