/**
 * How the router reads and writes the URL's search (`?event=…&unread=true`).
 *
 * The router's default turns every value that looks like a number into one, already while it
 * decodes (`toValue` in @tanstack/router-core's qss.ts): `?event=0` became the number 0, which
 * the route's `z.string()` refuses, and the page broke. JMAP ids may be all digits, and links the
 * app does not build itself (the reminder push in server/push/reminders.ts, a bookmark) write
 * them plainly. The search of the app's routes holds only text and flags, so values stay text,
 * "true" and "false" become flags, and a quoted value is text (as the default writes "0", so
 * links from before keep working).
 */

type Search = Record<string, unknown>;

const readValue = (value: string): unknown => {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value.startsWith('"')) {
    try {
      const text: unknown = JSON.parse(value);
      if (typeof text === "string") return text;
    } catch {
      // not quoted after all: the text as it is
    }
  }
  return value;
};

/** Text that would read back as something else ("true", a quoted value) is written quoted. */
const writeValue = (value: unknown): string => {
  if (typeof value !== "string") return String(value);
  return readValue(value) === value ? value : JSON.stringify(value);
};

export const parseSearch = (search: string): Search => {
  const result: Search = {};
  for (const [key, value] of new URLSearchParams(search)) result[key] = readValue(value);
  return result;
};

export const stringifySearch = (search: Search): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value !== undefined) params.set(key, writeValue(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
};
