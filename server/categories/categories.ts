/**
 * Mail categories: coloured tags on a mail, several at once, next to the one folder it is in. On
 * the mail a category is a keyword (RFC 8621 §4.1.1, IMAP flags), readable like
 * "wartet-auf-antwort" so other programs (Thunderbird) show something sensible; its name and
 * colour are kept per account by Sekretär. In a shared mailbox every member sees the same
 * categories, which makes info@ a small task list. Pure; used by the app and the server.
 */
import { z } from "zod";

export const CATEGORY_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "violet",
  "gray",
] as const;
export type CategoryColor = (typeof CATEGORY_COLORS)[number];

/** Printable ASCII without the characters IMAP keeps for itself; lower case, as Stalwart stores. */
const KEYWORD = /^[a-z0-9][a-z0-9._-]{0,62}$/;

export const categorySchema = z.object({
  keyword: z.string().regex(KEYWORD),
  name: z.string().trim().min(1).max(40),
  color: z.enum(CATEGORY_COLORS),
});
export type Category = z.infer<typeof categorySchema>;

export const categoriesSchema = z
  .array(categorySchema)
  .max(30)
  .refine((list) => new Set(list.map((c) => c.keyword)).size === list.length, "doppelt");

/** What an account starts with: enough to use a shared mailbox as a task list. */
export const DEFAULT_CATEGORIES: Category[] = [
  { keyword: "in-bearbeitung", name: "In Bearbeitung", color: "blue" },
  { keyword: "wartet-auf-antwort", name: "Wartet auf Antwort", color: "yellow" },
  { keyword: "erledigt", name: "Erledigt", color: "green" },
];

const TRANSLITERATION: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/** The keyword for a new category: its name in plain letters, unique among `taken`. */
export const keywordFor = (name: string, taken: string[]): string => {
  const base =
    name
      .toLowerCase()
      .replace(/[äöüß]/g, (letter) => TRANSLITERATION[letter] ?? letter)
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "kategorie";
  let keyword = base;
  for (let n = 2; taken.includes(keyword); n++) keyword = `${base}-${n}`;
  return keyword;
};
