/**
 * The few header fields a move needs from a mail (RFC 5322): its Message-ID against duplicates,
 * the date it arrived and whether it was read (readpst writes `Status: RO` for read mail).
 */

export type MailFacts = { messageId: string | null; receivedAt: string | null; seen: boolean };

/** The header block, with folded lines joined. */
const headerOf = (raw: string): string => {
  const end = raw.search(/\r?\n\r?\n/);
  return (end < 0 ? raw : raw.slice(0, end)).replace(/\r?\n[ \t]+/g, " ");
};

const field = (header: string, name: string): string | null =>
  header.match(new RegExp(`^${name}:[ \\t]*(.*)$`, "im"))?.[1]?.trim() ?? null;

/** RFC 5322 dates; readpst sometimes writes the date twice, separated by a comma. */
const parseDate = (value: string | null): string | null => {
  if (!value) return null;
  const first = value.replace(/\s*\([A-Z]+\)\s*,.*$/, "").replace(/\s*\([^)]*\)\s*$/, "");
  const time = Date.parse(first);
  return Number.isNaN(time) ? null : new Date(time).toISOString().replace(/\.\d{3}Z$/, "Z");
};

export const mailFacts = (raw: string): MailFacts => {
  const header = headerOf(raw);
  return {
    messageId: field(header, "Message-ID")?.replace(/^<|>$/g, "") || null,
    receivedAt: parseDate(field(header, "Date")),
    seen: /R/.test(field(header, "Status") ?? ""),
  };
};
