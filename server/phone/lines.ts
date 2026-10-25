/**
 * The box's numbers: the first IP phone at the Fritzbox (its people: "Wer klingelt") and extra
 * ones for direct numbers, each with its own people. Which line a call came in on decides who
 * hears it; who calls out uses their own direct number when they have one. Pure.
 */
import { toE164 } from "./numbers";
import { outgoingCall, type PhoneCall, type RingPlan } from "./phone";
import type { CallEvent, DeskPhone } from "./protocol";
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

export type DeskSetting = PhoneSettings["deskPhones"][number];

/**
 * A desk phone as the box gets it: the lines it rings for – its person's lines, or the first
 * line's when it belongs to nobody – and the direct line it calls out with.
 */
export const deskForBox = (settings: PhoneSettings, desk: DeskSetting): DeskPhone => {
  const first = settings.line?.username;
  const member = desk.member;
  const lines = member
    ? [
        ...(settings.ring.includes(member) && first ? [first] : []),
        ...settings.extraLines
          .filter((line) => line.ring.includes(member))
          .map((line) => line.username),
      ]
    : first
      ? [first]
      : [];
  return {
    id: desk.id,
    label: desk.label,
    mac: desk.mac,
    extension: desk.extension,
    password: desk.password,
    lines,
    outLine: member ? (outLineOf(settings, member)?.id ?? null) : null,
  };
};

export const deskOf = (settings: PhoneSettings, id: string): DeskSetting | null =>
  settings.deskPhones.find((desk) => desk.id === id) ?? null;

/** A call dialled at a desk phone: its person's, or the first line's people see it. */
export const deskCall = (
  settings: PhoneSettings,
  boxId: string,
  event: CallEvent,
  id: string,
  now: Date,
): PhoneCall => {
  const desk = deskOf(settings, event.desk ?? "");
  const member = desk?.member ?? null;
  return {
    ...outgoingCall({
      id,
      boxId,
      member: member ?? "",
      remote: toE164(event.remote) ?? event.remote,
      room: "",
      at: now.toISOString(),
    }),
    boxCallId: event.call,
    member,
    members: member ? [member] : settings.ring,
    room: null,
    desk: desk?.label ?? null,
  };
};
