/**
 * The box's dialplan (extensions.conf), written whole from what Kontext wants. Every step of a
 * call is reported on the manager interface as a KontextCall user event, which the agent turns
 * into call events (ami.ts). Pure.
 *
 * - Incoming (kontext-in): outside the opening hours the caller hears the closing greeting (and
 *   may leave a message); otherwise the call rings here until someone answers in Kontext, then the
 *   agent moves it to kontext-answer, which dials LiveKit SIP with the room's id as the number
 *   (LiveKit's dispatch_rule_callee puts it into "kontext-phone-<id>"). The caller is connected
 *   only then, so the desk phones keep ringing until someone takes it.
 * - Mailbox (kontext-mailbox, kontext-record): when nobody answered in time, the box picks up,
 *   plays the greeting and records a message; the agent uploads it when the caller hangs up.
 * - Outgoing: the agent originates a call to LiveKit SIP (the room Kontext named) and, once that
 *   leg is up, kontext-out dials the number through the Fritzbox.
 */
import type { BoxConfig } from "../../server/phone/protocol";

/** Where the box keeps the sounds from Kontext and the messages it records. */
export type BoxPaths = { sounds: string; recordings: string };

type Direction = "in" | "out";

/** A call step for the agent; values are dialplan expressions. */
export const report = (state: string, direction: Direction, extra: [string, string][] = []) =>
  `UserEvent(KontextCall,${[
    ["Call", `\${KONTEXT_CALL}`],
    ["State", state],
    ["Direction", direction],
    ...extra,
  ]
    .map(([key, value]) => `${key}: ${value}`)
    .join(",")})`;

/** A context: its first line starts the extension, `same =>` continues it. */
const extension = (exten: string, steps: string[]) =>
  steps.map((step, i) => (i === 0 ? `exten => ${exten},1,${step}` : ` same => n,${step}`));

const context = (name: string, ...extensions: string[][]) =>
  [`[${name}]`, ...extensions.flat(), ""].join("\n");

const ended = (direction: Direction, extra: [string, string][] = []) =>
  extension("h", [report("ended", direction, [["Cause", `\${HANGUPCAUSE}`], ...extra])]);

/** Plays a sound from Kontext (Asterisk finds the .wav itself). */
export const play = (paths: BoxPaths, id: string) => `Playback(${paths.sounds}/${id})`;

const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const MONTH_NAMES = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

/**
 * The opening-hours check at the start of a call: closed days first, then every open range, the
 * rest is closed. Asterisk compares in the company's time zone (GotoIfTime's fifth field).
 */
const hoursCheck = ({ hours }: BoxConfig): string[] => {
  if (!hours) return [];
  const zone = hours.timezone;
  const holidays = hours.closedDays.map((day) => {
    const [, month, date] = day.split("-").map(Number);
    return `GotoIfTime(*,*,${date},${MONTH_NAMES[month! - 1]},${zone}?closed,1)`;
  });
  const open = hours.open.map(
    (range) =>
      `GotoIfTime(${range.from}-${range.to},${DAY_NAMES[range.day]},*,*,${zone}?ringing,1)`,
  );
  return [...holidays, ...open, "Goto(closed,1)"];
};

/** Asks the mailbox for a message, or ends the call when there is none. */
const toMailbox = (config: BoxConfig) =>
  config.mailbox ? "Goto(kontext-record,s,1)" : "Hangup(16)";

const incoming = (config: BoxConfig, paths: BoxPaths) => {
  const caller: [string, string][] = [
    ["Remote", `\${CALLERID(num)}`],
    ["Local", `\${CALLERID(dnid)}`],
  ];
  const closed = config.hours
    ? extension("closed", [
        report("closed", "in", caller),
        "Answer()",
        ...(config.hours.greeting ? [play(paths, config.hours.greeting)] : []),
        toMailbox(config),
      ])
    : [];
  return context(
    "kontext-in",
    extension("_[+0-9a-zA-Z].", ["Goto(ring,1)"]),
    extension("s", ["Goto(ring,1)"]),
    extension("ring", [
      `Set(__KONTEXT_CALL=\${UNIQUEID})`,
      ...(config.hours ? hoursCheck(config) : ["Goto(ringing,1)"]),
    ]),
    extension("ringing", [
      report("ringing", "in", caller),
      "Ringing()",
      `Wait(${config.ringSeconds})`,
      config.mailbox ? "Goto(kontext-mailbox,s,1)" : "Hangup(19)",
    ]),
    closed,
    ended("in"),
  );
};

/** After ringing in vain: the greeting, then the message (kontext-record). */
const mailbox = (config: BoxConfig, paths: BoxPaths) => {
  if (!config.mailbox) return "";
  const { greeting, maxSeconds } = config.mailbox;
  return [
    context(
      "kontext-mailbox",
      extension("s", [
        "Answer()",
        report("mailbox", "in"),
        ...(greeting ? [play(paths, greeting)] : []),
        "Goto(kontext-record,s,1)",
      ]),
    ),
    // A beep, up to maxSeconds of message, ended by four seconds of silence or hanging up.
    context(
      "kontext-record",
      extension("s", [
        `Record(${paths.recordings}/\${KONTEXT_CALL}.wav,4,${maxSeconds},k)`,
        "Hangup(16)",
      ]),
      ended("in", [["Recording", `\${RECORDED_FILE}`]]),
    ),
  ].join("\n");
};

/** The dialplan. ${KONTEXT_ROOM} is set by the agent before it moves a call. */
export const extensionsConf = (config: BoxConfig, paths: BoxPaths): string =>
  [
    "[general]\nstatic=yes\nwriteprotect=yes\n",
    "[globals]\n",
    incoming(config, paths),
    context(
      "kontext-answer",
      extension("answer", [
        report("answered", "in"),
        `Dial(PJSIP/\${KONTEXT_ROOM}@livekit,30)`,
        "Hangup()",
      ]),
      ended("in"),
    ),
    context(
      "kontext-out",
      extension("_X.", [
        report("ringing", "out", [["Remote", `\${EXTEN}`]]),
        `Dial(PJSIP/\${EXTEN}@fritzbox,60,U(kontext-callee-answered))`,
        "Hangup()",
      ]),
      ended("out", [["DialStatus", `\${DIALSTATUS}`]]),
    ),
    context("kontext-callee-answered", extension("s", [report("answered", "out"), "Return()"])),
    // LiveKit never calls in on its own; anything from it ends there.
    context("kontext-refuse", extension("_.", ["Hangup(21)"])),
    mailbox(config, paths),
  ].join("\n");
