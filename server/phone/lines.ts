/**
 * The box's numbers: the first IP phone at the Fritzbox (its people: "Wer klingelt") and extra
 * ones for direct numbers, each with its own people. Which line a call came in on decides who
 * hears it; who calls out uses their own direct number when they have one. Pure.
 */
import type { RingPlan } from "./phone";
import type { PhoneSettings } from "./store";

export type ExtraLine = PhoneSettings["extraLines"][number];

/** The extra line a call came in on, by the IP phone's user name; null: the first one. */
export const lineOf = (settings: PhoneSettings, username: string | undefined): ExtraLine | null =>
  (username && settings.extraLines.find((line) => line.username === username)) || null;

/** The ring plan for a call on this line: the first line's plan, or all of a direct line's people. */
export const ringPlanFor = (settings: PhoneSettings, line: ExtraLine | null): RingPlan =>
  line
    ? { mode: "all", stepSeconds: settings.ringStepSeconds, order: line.ring }
    : { mode: settings.ringMode, stepSeconds: settings.ringStepSeconds, order: settings.ring };

/** Everyone who hears some line: they may see the list, call out and get calls handed on. */
export const everyone = (settings: PhoneSettings): string[] => [
  ...new Set([...settings.ring, ...settings.extraLines.flatMap((line) => line.ring)]),
];

/** The direct line someone calls out with, so the other side sees that number. */
export const outLineOf = (settings: PhoneSettings, me: string): ExtraLine | null =>
  settings.extraLines.find((line) => line.ring.includes(me)) ?? null;
