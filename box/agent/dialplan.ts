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
 *   leg is up, kontext-out dials the number through the Fritzbox, with the line the agent chose
 *   (${KONTEXT_OUT}: the first IP phone, or an extra one for a direct number).
 */
import type { BoxConfig } from "../../server/phone/protocol";

/** Where the box keeps the sounds from Kontext and the messages it records. */
export type BoxPaths = { sounds: string; recordings: string };

/** A call step for the agent; values are dialplan expressions. */
export const report = (state: string, direction: string, extra: [string, string][] = []) =>
  `UserEvent(KontextCall,${[
    ["Call", `\${KONTEXT_CALL}`],
    ["State", state],
    ["Direction", direction],
    ...extra,
  ]
    .map(([key, value]) => `${key}: ${value}`)
    .join(",")})`;

/**
 * An extension: its first step starts it, `same =>` continues it. A step may carry a label to
 * jump to, written "(label)Step()".
 */
const extension = (exten: string, steps: string[]) =>
  steps.map((step, i) => {
    const [, label, app] = step.match(/^(?:\((\w+)\))?(.*)$/)!;
    return i === 0 ? `exten => ${exten},1,${app}` : ` same => n${label ? `(${label})` : ""},${app}`;
  });

const context = (name: string, ...extensions: string[][]) =>
  [`[${name}]`, ...extensions.flat(), ""].join("\n");

/**
 * The line to the outside reports its end wherever it is when it hangs up – ringing, in Kontext's
 * room, on hold, on the mailbox – by a hangup handler, not by each context's "h".
 */
const reportEnd = "Set(CHANNEL(hangup_handler_push)=kontext-ended,s,1)";

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

/**
 * While it rings in Kontext: wait – or, with a forwarding number, wait a while, then let that
 * number ring too until the ringing time is up. Answered there, the call ends with it; Kontext
 * can still take it while it rings (the agent's Redirect ends the Dial).
 */
const waitForAnswer = ({ ringSeconds, forward }: BoxConfig): string[] => {
  if (!forward) return [`Wait(${ringSeconds})`];
  const rest = Math.max(5, ringSeconds - forward.afterSeconds);
  return [
    ...(forward.afterSeconds ? [`Wait(${forward.afterSeconds})`] : []),
    `Dial(PJSIP/${forward.number}@fritzbox,${rest},U(kontext-forward-answered))`,
    `ExecIf($["\${DIALSTATUS}" = "ANSWER"]?Hangup(16))`,
  ];
};

/** Asks the mailbox for a message, or ends the call when there is none. */
const toMailbox = (config: BoxConfig) =>
  config.mailbox ? "Goto(kontext-record,s,1)" : "Hangup(16)";

const incoming = (config: BoxConfig, paths: BoxPaths) => {
  const caller: [string, string][] = [
    ["Remote", `\${CALLERID(num)}`],
    ["Local", `\${CALLERID(dnid)}`],
    ["Line", `\${KONTEXT_LINE}`],
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
    // The number dialled is the IP phone's user name: which of the box's lines was called.
    extension("_[+0-9a-zA-Z].", [`Set(__KONTEXT_LINE=\${EXTEN})`, "Goto(ring,1)"]),
    extension("s", ["Goto(ring,1)"]),
    extension("ring", [
      `Set(__KONTEXT_CALL=\${UNIQUEID})`,
      "Set(__KONTEXT_DIR=in)",
      reportEnd,
      ...(config.hours ? hoursCheck(config) : ["Goto(ringing,1)"]),
    ]),
    extension("ringing", [
      report("ringing", "in", caller),
      "Ringing()",
      ...waitForAnswer(config),
      config.mailbox ? "Goto(kontext-mailbox,s,1)" : "Hangup(19)",
    ]),
    closed,
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
    ),
  ].join("\n");
};

/**
 * Out through the Fritzbox, once the line into Kontext's room is up. Answered, the line outside
 * reports its own end (kontext-callee-answered); not answered (busy, no answer, cancelled), the
 * line into Kontext reports why (kontext-out-ended).
 */
const dialOut = [
  "Set(__KONTEXT_DIR=out)",
  "Set(CHANNEL(hangup_handler_push)=kontext-out-ended,s,1)",
  report("ringing", "out", [["Remote", `\${EXTEN}`]]),
  `Dial(PJSIP/\${EXTEN}@\${KONTEXT_OUT},60,U(kontext-callee-answered))`,
  "Hangup()",
];

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
    ),
    // Held: the line outside hears music, out of Kontext's room …
    context("kontext-hold", extension("s", ["MusicOnHold()"])),
    // … and back into it (the agent sets ${KONTEXT_ROOM} again).
    context(
      "kontext-resume",
      extension("s", [`Dial(PJSIP/\${KONTEXT_ROOM}@livekit,30)`, "Hangup()"]),
    ),
    // Numbers, and the Fritzbox's own telephones by their internal number ("**610").
    context("kontext-out", extension("_X.", dialOut), extension("_**X.", dialOut)),
    context(
      "kontext-callee-answered",
      extension("s", [report("answered", "out"), reportEnd, "Return()"]),
    ),
    context(
      "kontext-forward-answered",
      extension("s", [report("answered", "in", [["Forwarded", "1"]]), "Return()"]),
    ),
    context(
      "kontext-ended",
      extension("s", [
        report("ended", `\${KONTEXT_DIR}`, [
          ["Cause", `\${HANGUPCAUSE}`],
          ["Recording", `\${RECORDED_FILE}`],
        ]),
        "Return()",
      ]),
    ),
    context(
      "kontext-out-ended",
      extension("s", [
        `GotoIf($["\${DIALSTATUS}" = "ANSWER"]?done)`,
        report("ended", "out", [
          ["Cause", `\${HANGUPCAUSE}`],
          ["DialStatus", `\${DIALSTATUS}`],
        ]),
        "(done)Return()",
      ]),
    ),
    // LiveKit never calls in on its own; anything from it ends there.
    context("kontext-refuse", extension("_.", ["Hangup(21)"])),
    mailbox(config, paths),
  ].join("\n");
