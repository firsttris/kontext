/**
 * The out-of-office form and RFC 8621's VacationResponse, in both directions, and the sentence
 * that names a deputy. Used for the own reply and by the Firmenverwaltung for a colleague.
 */
import type { Vacation } from "@/jmap/settings";
import { m } from "@/paraglide/messages";
import { htmlToText, textToHtml } from "./html";
import { addDays, dateKey, fromLocal } from "./jscalendar";

export type VacationForm = {
  isEnabled: boolean;
  from: string;
  to: string;
  subject: string;
  text: string;
};

export const EMPTY_VACATION_FORM: VacationForm = {
  isEnabled: false,
  from: "",
  to: "",
  subject: "",
  text: "",
};

/** The last day of an absence is inclusive; JMAP's toDate is the moment it ends. */
const toInstant = (day: string, endOfDay: boolean): string | null =>
  day ? fromLocal(`${endOfDay ? addDays(day, 1) : day}T00:00:00`).toISOString() : null;

const fromInstant = (iso: string | null, endOfDay: boolean): string =>
  iso ? dateKey(new Date(new Date(iso).getTime() - (endOfDay ? 1 : 0))) : "";

export const toVacationForm = (vacation: Vacation): VacationForm => ({
  isEnabled: vacation.isEnabled,
  from: fromInstant(vacation.fromDate, false),
  to: fromInstant(vacation.toDate, true),
  subject: vacation.subject ?? "",
  text: vacation.textBody ?? (vacation.htmlBody ? htmlToText(vacation.htmlBody) : ""),
});

export const toVacation = (form: VacationForm): Vacation => {
  const text = form.text.trim();
  return {
    isEnabled: form.isEnabled,
    fromDate: toInstant(form.from, false),
    toDate: toInstant(form.to, true),
    subject: form.subject.trim() || null,
    textBody: text || null,
    htmlBody: text ? textToHtml(text) : null,
  };
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A line written by `withDeputy`, whoever it names: it starts like the sentence. */
const deputyLine = () => {
  const head = m.vacation_deputy_line({ name: "\u0001", email: "" }).split("\u0001")[0] ?? "";
  return new RegExp(`^${escapeRegExp(head)}.*$`, "m");
};

/** The message with the deputy named in its own line (replaced, added, or removed for none). */
export const withDeputy = (
  text: string,
  deputy: { name: string; email: string } | null,
): string => {
  const line = deputy ? m.vacation_deputy_line(deputy) : "";
  const pattern = deputyLine();
  if (pattern.test(text)) {
    return text
      .replace(pattern, line)
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  const body = text.trim();
  return line ? `${body}${body ? "\n\n" : ""}${line}` : text;
};
