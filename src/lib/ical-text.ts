/**
 * The text layer of iCalendar (RFC 5545 §3.1–3.3): escaped TEXT values, quoted parameters, folded
 * lines and UTC stamps. Shared by the tasks for CalDAV (server/dav/ical.ts) and the invitations
 * (itip.ts). Pure.
 */

/** A TEXT value: "\\", ";", "," escaped, line breaks as "\n" (§3.3.11). */
export const writeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/**
 * A parameter value (§3.2): in quotes when it holds ":", ";" or ","; a quote itself cannot be
 * written there and goes, control characters too.
 */
export const paramValue = (value: string) => {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are not allowed
  const clean = value.replace(/["\u0000-\u001f\u007f]/g, "");
  return /[:;,]/.test(clean) ? `"${clean}"` : clean;
};

/** Lines longer than 75 octets folded (RFC 5545 §3.1), not inside a character. */
export const fold = (line: string): string => {
  const bytes = new TextEncoder();
  if (bytes.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    if (bytes.encode(current + char).length > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = "";
    }
    current += char;
  }
  return [...parts, current].join("\r\n ");
};

/** "20261120T090000Z": an instant as a UTC DATE-TIME (§3.3.5, form #2). */
export const utcStamp = (date: Date) =>
  date.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
