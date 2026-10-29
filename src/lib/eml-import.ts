/**
 * Bringing single mails in as .eml files: which files go (an .eml is one RFC 5322 message; an
 * Outlook .msg is a binary container and an .mbox a whole mailbox, neither of which Stalwart's
 * Email/import reads), and the time a mail counts as received, read from its Date header.
 */
import type { Mailbox } from "@/jmap/types";

export type FileProblem = "msg" | "mbox" | "type" | "empty";
export type FileCheck = { ok: true } | { ok: false; problem: FileProblem };

const extension = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
};

/** Whether a file can be imported as a mail; a size over the server's limit fails at the upload. */
export const checkFile = (file: { name: string; type: string; size: number }): FileCheck => {
  const ext = extension(file.name);
  const type = file.type.toLowerCase();
  if (ext === "msg" || type === "application/vnd.ms-outlook") return { ok: false, problem: "msg" };
  if (ext === "mbox" || type === "application/mbox") return { ok: false, problem: "mbox" };
  if (ext !== "eml" && type !== "message/rfc822") return { ok: false, problem: "type" };
  if (file.size === 0) return { ok: false, problem: "empty" };
  return { ok: true };
};

/** The value of the (first) Date header in a mail's header section, unfolded (RFC 5322 §2.2.3). */
export const dateHeader = (raw: string): string | undefined => {
  const end = raw.search(/\r?\n\r?\n/);
  const head = (end === -1 ? raw : raw.slice(0, end)).replace(/\r?\n[ \t]+/g, " ");
  const line = head.split(/\r?\n/).find((entry) => /^date[ \t]*:/i.test(entry));
  return line?.slice(line.indexOf(":") + 1).trim() || undefined;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The obsolete zone names with a fixed offset, in hours (RFC 5322 §4.3). */
const NAMED_ZONES: Record<string, number> = {
  edt: -4,
  est: -5,
  cdt: -5,
  cst: -6,
  mdt: -6,
  mst: -7,
  pdt: -7,
  pst: -8,
};

/** Offset in minutes east of UTC; UT, GMT and other old zone names count as -0000 (§4.3). */
const zoneOffset = (zone: string | undefined): number => {
  const named = NAMED_ZONES[zone?.toLowerCase() ?? ""];
  if (named !== undefined) return named * 60;
  const numeric = zone?.match(/^([+-])(\d{2})(\d{2})$/);
  if (!numeric) return 0;
  const minutes = Number(numeric[2]) * 60 + Number(numeric[3]);
  return numeric[1] === "-" ? -minutes : minutes;
};

/** Two- and three-digit years as RFC 5322 §4.3 reads them. */
const fullYear = (year: string) => {
  const value = Number(year);
  if (year.length === 4) return value;
  if (year.length === 3) return 1900 + value;
  return value < 50 ? 2000 + value : 1900 + value;
};

/** An RFC 5322 date-time ("Tue, 1 Jul 2003 10:52:37 +0200"), comments allowed. */
export const parseMailDate = (value: string): Date | undefined => {
  const text = value.replace(/\([^)]*\)/g, " ").trim();
  const match = text.match(
    /^(?:[a-z]{3},\s*)?(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([+-]\d{4}|[a-z]+)?$/i,
  );
  if (!match) return undefined;
  const [, day, monthName, year, hour, minute, second, zone] = match;
  const month = MONTHS.indexOf(monthName!.toLowerCase());
  if (month === -1) return undefined;
  const local = Date.UTC(
    fullYear(year!),
    month,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0),
  );
  const date = new Date(local - zoneOffset(zone) * 60_000);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

/** A clock that is a little ahead still counts; a mail from next year does not. */
const FUTURE_SLACK = 24 * 60 * 60 * 1000;

/**
 * `receivedAt` for Email/import (a UTCDate, RFC 8620 §1.4): the Date header when it is readable
 * and not in the future. Without it Stalwart takes the newest Received header, or the time of the
 * import (crates/email/src/message/ingest.rs).
 */
export const receivedAtOf = (raw: string, now: Date): string | undefined => {
  const header = dateHeader(raw);
  const date = header ? parseMailDate(header) : undefined;
  if (!date || date.getTime() < 0 || date.getTime() > now.getTime() + FUTURE_SLACK)
    return undefined;
  return `${date.toISOString().slice(0, 19)}Z`;
};

/** Roles whose folders hold no imported mails: drafts are written here, the others are views. */
const NO_IMPORT = new Set(["drafts", "flagged", "snoozed"]);

/** Whether mails may be imported into the folder. */
export const acceptsImport = (mailbox: Mailbox): boolean =>
  !NO_IMPORT.has(mailbox.role ?? "") && mailbox.myRights?.mayAddItems !== false;
