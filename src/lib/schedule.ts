/**
 * Sending later and taking a mail back: the times offered for "Später senden", the time format
 * for HOLDUNTIL (FUTURERELEASE, RFC 4865), and how long a sent mail waits for "Rückgängig". Pure;
 * times are local to the company (Europe/Berlin).
 */
import { m } from "@/paraglide/messages";
import { addDays, dateKey, fromLocal, toLocal } from "./jscalendar";

/** Seconds a sent mail waits in the queue, so "Rückgängig" can still stop it. */
export const UNDO_CHOICES = [0, 5, 10, 20, 30] as const;
export type UndoSeconds = (typeof UNDO_CHOICES)[number];
export const DEFAULT_UNDO: UndoSeconds = 10;

/**
 * How far ahead a mail may be planned. Stalwart announces 30 days (maxDelayedSend), its SMTP
 * default for future release is 7 (crates/registry/src/schema/structs_impl.rs); the smaller one.
 */
export const MAX_HOLD_DAYS = 7;

/** RFC 4865 wants a date-time in UTC, without fractions of a second. */
export const holdUntil = (at: Date): string => at.toISOString().replace(/\.\d+Z$/, "Z");

export type SendChoice = { label: string; at: Date };

const at = (day: string, hour: number) =>
  fromLocal(`${day}T${String(hour).padStart(2, "0")}:00:00`);

/** "Heute 13:00" (before noon), "Heute 17:00" (before four), "Morgen 08:00", "Montag 08:00". */
export const sendChoices = (now: Date): SendChoice[] => {
  const today = dateKey(now);
  const hour = Number(toLocal(now).slice(11, 13));
  const choices: SendChoice[] = [];
  if (hour < 12) choices.push({ label: m.mail_later_today({ time: "13:00" }), at: at(today, 13) });
  if (hour < 16) choices.push({ label: m.mail_later_today({ time: "17:00" }), at: at(today, 17) });
  const tomorrow = addDays(today, 1);
  choices.push({ label: m.mail_later_tomorrow({ time: "08:00" }), at: at(tomorrow, 8) });
  // Monday morning, unless that is tomorrow anyway.
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  const toMonday = (8 - weekday) % 7 || 7;
  if (toMonday > 1) {
    choices.push({
      label: m.mail_later_monday({ time: "08:00" }),
      at: at(addDays(today, toMonday), 8),
    });
  }
  return choices;
};

/** A time picked by hand is fine if it lies ahead, within what the server holds. */
export const validSendTime = (at: Date, now: Date): boolean =>
  at.getTime() > now.getTime() + 60_000 &&
  at.getTime() < now.getTime() + MAX_HOLD_DAYS * 86_400_000;

/** "Mo., 26. Okt., 08:00", for the notice and the scheduled mails. */
export const sendTimeLabel = (at: Date): string =>
  at.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
