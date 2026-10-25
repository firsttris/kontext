/**
 * What the calls of the last weeks say: how many came in, how many were answered and how fast,
 * how many were missed and when (weekday and hour, in the company's time zone), and who took
 * them. From the calls someone may see. Pure.
 */
import type { PhoneCall } from "./phone";

export type CallStats = {
  days: number;
  incoming: number;
  answered: number;
  missed: number;
  closed: number;
  voicemails: number;
  outgoing: number;
  /** Seconds from ringing to answered, on average; null without answered calls. */
  answerSeconds: number | null;
  /** Missed calls (and outside the hours) by weekday (0 = Monday) and hour (0–23). */
  missedAt: number[][];
  /** Answered incoming calls per person. */
  byMember: { member: string; answered: number }[];
};

const zoned = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  hour: "2-digit",
  hour12: false,
});
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Weekday (Monday 0) and hour of an instant in Berlin. */
export const berlinSlot = (iso: string): { day: number; hour: number } => {
  const parts = Object.fromEntries(
    zoned.formatToParts(new Date(iso)).map((part) => [part.type, part.value]),
  );
  return { day: WEEKDAYS.indexOf(parts.weekday ?? "Mon"), hour: Number(parts.hour) % 24 };
};

export const callStats = (calls: PhoneCall[], now: Date, days: number): CallStats => {
  const since = now.getTime() - days * 86_400_000;
  const recent = calls.filter((call) => Date.parse(call.startedAt) >= since);
  const incoming = recent.filter((call) => call.direction === "in" && call.outcome !== "blocked");
  const answered = incoming.filter((call) => call.answeredAt);
  const missed = incoming.filter((call) => call.outcome === "missed" || call.outcome === "closed");
  const missedAt = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const call of missed) {
    const { day, hour } = berlinSlot(call.startedAt);
    missedAt[day]![hour]!++;
  }
  const waits = answered.map(
    (call) => (Date.parse(call.answeredAt!) - Date.parse(call.startedAt)) / 1000,
  );
  const counts = new Map<string, number>();
  for (const call of answered) {
    if (call.member) counts.set(call.member, (counts.get(call.member) ?? 0) + 1);
  }
  return {
    days,
    incoming: incoming.length,
    answered: answered.length,
    missed: missed.filter((call) => call.outcome === "missed").length,
    closed: missed.filter((call) => call.outcome === "closed").length,
    voicemails: incoming.filter((call) => call.voicemailSeconds).length,
    outgoing: recent.filter((call) => call.direction === "out").length,
    answerSeconds: waits.length
      ? Math.round(waits.reduce((sum, wait) => sum + wait, 0) / waits.length)
      : null,
    missedAt,
    byMember: [...counts]
      .map(([member, count]) => ({ member, answered: count }))
      .sort((left, right) => right.answered - left.answered),
  };
};
