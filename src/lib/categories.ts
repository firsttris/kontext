/**
 * Categories as the app shows them: the colours, which categories a mail has, and the list after
 * adding, changing or removing one. Pure; what a category is: server/categories/categories.ts.
 */
import { m } from "@/paraglide/messages";
import {
  CATEGORY_COLORS,
  type Category,
  type CategoryColor,
  keywordFor,
} from "../../server/categories/categories";

export { CATEGORY_COLORS, type Category, type CategoryColor };

/** Full class names, so Tailwind finds them. */
export const COLOR_STYLES: Record<CategoryColor, { dot: string; chip: string }> = {
  red: { dot: "bg-red-500", chip: "bg-red-500/12 text-red-700 dark:text-red-300" },
  orange: { dot: "bg-orange-500", chip: "bg-orange-500/12 text-orange-700 dark:text-orange-300" },
  yellow: { dot: "bg-amber-400", chip: "bg-amber-400/18 text-amber-800 dark:text-amber-300" },
  green: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
  teal: { dot: "bg-teal-500", chip: "bg-teal-500/12 text-teal-700 dark:text-teal-300" },
  blue: { dot: "bg-blue-500", chip: "bg-blue-500/12 text-blue-700 dark:text-blue-300" },
  violet: { dot: "bg-violet-500", chip: "bg-violet-500/12 text-violet-700 dark:text-violet-300" },
  gray: { dot: "bg-zinc-400", chip: "bg-zinc-500/12 text-zinc-700 dark:text-zinc-300" },
};

export const COLOR_NAMES: Record<CategoryColor, () => string> = {
  red: m.category_color_red,
  orange: m.category_color_orange,
  yellow: m.category_color_yellow,
  green: m.category_color_green,
  teal: m.category_color_teal,
  blue: m.category_color_blue,
  violet: m.category_color_violet,
  gray: m.category_color_gray,
};

/** The categories set on a mail, in the account's order; keywords without a category are left out. */
export const categoriesOn = (
  keywords: Record<string, boolean>,
  categories: Category[],
): Category[] => categories.filter((category) => keywords[category.keyword]);

/** A new category at the end, with a keyword of its own and the next unused colour. */
export const addCategory = (categories: Category[], name: string): Category[] => {
  const used = new Set(categories.map((category) => category.color));
  const color = CATEGORY_COLORS.find((candidate) => !used.has(candidate)) ?? "gray";
  const keyword = keywordFor(
    name,
    categories.map((category) => category.keyword),
  );
  return [...categories, { keyword, name: name.trim(), color }];
};

/** A category renamed or recoloured; its keyword stays, so mails keep it. */
export const changeCategory = (
  categories: Category[],
  keyword: string,
  patch: Partial<Pick<Category, "name" | "color">>,
): Category[] =>
  categories.map((category) =>
    category.keyword === keyword ? { ...category, ...patch } : category,
  );

export const removeCategory = (categories: Category[], keyword: string): Category[] =>
  categories.filter((category) => category.keyword !== keyword);

/** The search for a category, limited to its mailbox ("in:info@ kategorie:…"). */
export const categorySearch = (category: Category, mailbox: string | null): string =>
  [mailbox ? `in:${mailbox}` : "", `kategorie:"${category.name}"`].filter(Boolean).join(" ");
