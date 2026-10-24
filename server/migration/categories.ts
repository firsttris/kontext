/**
 * Categories from the old mailbox: Outlook's categories (Microsoft Graph `categories`, colours from
 * `masterCategories`) and Thunderbird's tags (IMAP keywords like `$label1`). On import they become
 * the account's categories (categories/categories.ts); one missing there is added with its colour.
 * Outlook data files (PST) carry none: readpst writes categories only for contacts and
 * appointments (`write_extra_categories`, src/readpst.c in libpst 0.6.76). Pure functions.
 */
import {
  CATEGORY_COLORS,
  type Category,
  type CategoryColor,
  keywordFor,
} from "../categories/categories";

export type SourceCategory = { name: string; color?: CategoryColor };

/** Outlook's 25 colours ("preset0" red … "preset24" dark cranberry) on the app's eight. */
const OUTLOOK_PRESETS: CategoryColor[] = [
  "red", // 0 red
  "orange", // 1 orange
  "orange", // 2 brown
  "yellow", // 3 yellow
  "green", // 4 green
  "teal", // 5 teal
  "green", // 6 olive
  "blue", // 7 blue
  "violet", // 8 purple
  "red", // 9 cranberry
  "gray", // 10 steel
  "gray", // 11 dark steel
  "gray", // 12 gray
  "gray", // 13 dark gray
  "gray", // 14 black
  "red", // 15 dark red
  "orange", // 16 dark orange
  "orange", // 17 dark brown
  "yellow", // 18 dark yellow
  "green", // 19 dark green
  "teal", // 20 dark teal
  "green", // 21 dark olive
  "blue", // 22 dark blue
  "violet", // 23 dark purple
  "red", // 24 dark cranberry
];

export const outlookColor = (preset: string | undefined): CategoryColor | undefined => {
  const index = preset?.match(/^preset(\d+)$/)?.[1];
  return index === undefined ? undefined : OUTLOOK_PRESETS[Number(index)];
};

/** Thunderbird's five standard tags, as it names them in German. */
const THUNDERBIRD: Record<string, SourceCategory> = {
  $label1: { name: "Wichtig", color: "red" },
  $label2: { name: "Arbeit", color: "orange" },
  $label3: { name: "Persönlich", color: "green" },
  $label4: { name: "Zu erledigen", color: "blue" },
  $label5: { name: "Später", color: "violet" },
};

/** Keywords that are no tag a person set: spam training, receipts, server marks. */
const NOT_A_TAG = new Set(["junk", "nonjunk", "notjunk", "forwarded", "mdnsent"]);

/** The tags among a mail's IMAP flags: Thunderbird's own and plain keywords people made. */
export const imapCategories = (flags: Iterable<string>): SourceCategory[] =>
  [...flags].flatMap((flag) => {
    const known = THUNDERBIRD[flag.toLowerCase()];
    if (known) return [known];
    if (/^[\\$]/.test(flag) || NOT_A_TAG.has(flag.toLowerCase())) return [];
    return [{ name: flag }];
  });

/**
 * The account's categories with the wanted ones added where missing (found by name, without
 * regard to case), and each wanted name's keyword.
 */
export const resolveCategories = (
  existing: Category[],
  wanted: SourceCategory[],
): { categories: Category[]; keywords: Map<string, string> } => {
  const categories = [...existing];
  const keywords = new Map<string, string>();
  for (const { name, color } of wanted) {
    const clean = name.trim().slice(0, 40);
    if (!clean || keywords.has(clean.toLowerCase())) continue;
    let found = categories.find((category) => category.name.toLowerCase() === clean.toLowerCase());
    if (!found) {
      const used = new Set(categories.map((category) => category.color));
      found = {
        keyword: keywordFor(
          clean,
          categories.map((category) => category.keyword),
        ),
        name: clean,
        color: color ?? CATEGORY_COLORS.find((candidate) => !used.has(candidate)) ?? "gray",
      };
      categories.push(found);
    }
    keywords.set(clean.toLowerCase(), found.keyword);
  }
  return { categories, keywords };
};
