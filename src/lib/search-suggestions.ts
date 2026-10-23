/**
 * Suggestions under the search box while typing: contacts for `von:`/`an:`, folders for `in:`,
 * operators by their first letters, and the last searches when the box is empty.
 */
import type { EmailAddress } from "@/jmap/types";
import { m } from "@/paraglide/messages";

export type SearchSuggestion = {
  kind: "contact" | "folder" | "operator" | "recent";
  /** What the list shows. */
  label: string;
  detail?: string;
  /** The whole search text after picking it. */
  value: string;
};

const OPERATORS: { token: string; label: () => string }[] = [
  { token: "von:", label: m.search_op_from },
  { token: "an:", label: m.search_op_to },
  { token: "betreff:", label: m.search_op_subject },
  { token: "hat:anhang", label: m.search_op_attachment },
  { token: "ist:ungelesen", label: m.search_op_unread },
  { token: "ist:markiert", label: m.search_op_flagged },
  { token: "in:", label: m.search_op_in },
  { token: "nach:", label: m.search_op_after },
  { token: "vor:", label: m.search_op_before },
];

const PEOPLE_KEYS: Record<string, string> = { von: "von", from: "von", an: "an", to: "an" };

const quote = (value: string) => (/\s/.test(value) ? `"${value}"` : value);

/** The text with its last word replaced. */
const replaceLast = (input: string, token: string): string => {
  const head = input.replace(/\S*$/, "");
  return `${head}${token}`;
};

const matching = (contacts: EmailAddress[], needle: string, limit: number): EmailAddress[] => {
  const lower = needle.toLowerCase();
  const seen = new Set<string>();
  return contacts
    .filter(
      (c) => (c.name ?? "").toLowerCase().includes(lower) || c.email.toLowerCase().includes(lower),
    )
    .filter((c) => !seen.has(c.email.toLowerCase()) && seen.add(c.email.toLowerCase()))
    .slice(0, limit);
};

export const suggest = (
  input: string,
  { contacts, folders, recent }: { contacts: EmailAddress[]; folders: string[]; recent: string[] },
): SearchSuggestion[] => {
  if (!input.trim()) {
    return recent.slice(0, 6).map((value) => ({ kind: "recent", label: value, value }));
  }
  if (/\s$/.test(input)) return [];
  const last = input.split(/\s+/).at(-1) ?? "";
  const operator = last.match(/^([a-zä]+):(.*)$/i);

  if (operator) {
    const key = operator[1]!.toLowerCase();
    const value = operator[2]!.replace(/^"/, "");
    const people = PEOPLE_KEYS[key];
    if (people && value) {
      return matching(contacts, value, 6).map((contact) => ({
        kind: "contact",
        label: contact.name ?? contact.email,
        detail: contact.email,
        value: `${replaceLast(input, `${people}:${contact.email}`)} `,
      }));
    }
    if (key === "in") {
      return folders
        .filter((folder) => folder.toLowerCase().includes(value.toLowerCase()))
        .slice(0, 8)
        .map((folder) => ({
          kind: "folder",
          label: folder,
          value: `${replaceLast(input, `in:${quote(folder)}`)} `,
        }));
    }
    return [];
  }

  const lower = last.toLowerCase();
  const operators = OPERATORS.filter((o) => o.token.startsWith(lower) && o.token !== lower).map(
    (o): SearchSuggestion => ({
      kind: "operator",
      label: o.token,
      detail: o.label(),
      value: replaceLast(input, o.token) + (o.token.endsWith(":") ? "" : " "),
    }),
  );
  const people =
    last.length >= 2
      ? matching(contacts, last, 4).map(
          (contact): SearchSuggestion => ({
            kind: "contact",
            label: m.search_mails_from({ name: contact.name ?? contact.email }),
            detail: contact.email,
            value: `${replaceLast(input, `von:${contact.email}`)} `,
          }),
        )
      : [];
  return [...people, ...operators].slice(0, 8);
};

const RECENT_KEY = "sekretaer.recentSearches";

/** The last searches on this device (newest first). */
export const readRecent = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

export const rememberSearch = (query: string): void => {
  const text = query.trim();
  if (!text) return;
  try {
    const next = [text, ...readRecent().filter((q) => q !== text)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage may be refused; then there are no recent searches.
  }
};
