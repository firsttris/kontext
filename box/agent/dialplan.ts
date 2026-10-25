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
import type { BoxConfig, DeskPhone } from "../../server/phone/protocol";

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

/** A desk phone's endpoint (and its user name for signing in). */
export const deskEndpoint = (id: string) => `desk-${id}`;

/** The desk phones that ring for a line (by the IP phone's user name), as a Dial target. */
const desksFor = (config: BoxConfig, line: string | null) =>
  config.deskPhones
    .filter((desk) => desk.lines.includes(line ?? config.line?.username ?? ""))
    .map((desk) => `PJSIP/${deskEndpoint(desk.id)}`)
    .join("&");

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
const hoursCheck = ({ hours, menu }: BoxConfig): string[] => {
  if (!hours) return [];
  const target = menu ? "kontext-menu,s,1" : "ringing,1";
  const zone = hours.timezone;
  const holidays = hours.closedDays.map((day) => {
    const [, month, date] = day.split("-").map(Number);
    return `GotoIfTime(*,*,${date},${MONTH_NAMES[month! - 1]},${zone}?closed,1)`;
  });
  const open = hours.open.map(
    (range) =>
      `GotoIfTime(${range.from}-${range.to},${DAY_NAMES[range.day]},*,*,${zone}?${target})`,
  );
  return [...holidays, ...open, "Goto(closed,1)"];
};

/**
 * While it rings in Kontext: the desk phones ring with it – and, with a forwarding number, after
 * a while that number too, until the ringing time is up. Answered at one of them, the call ends
 * with it (kontext-answered-here tells which); Kontext can still take it while it rings (the
 * agent's Redirect ends the Dial).
 */
const waitForAnswer = ({ ringSeconds, forward }: BoxConfig, desks: string): string[] => {
  const ring = (targets: string, seconds: number) =>
    targets
      ? [
          `Dial(${targets},${seconds},U(kontext-answered-here))`,
          `ExecIf($["\${DIALSTATUS}" = "ANSWER"]?Hangup(16))`,
        ]
      : [`Wait(${seconds})`];
  if (!forward) return ring(desks, ringSeconds);
  const mobile = `PJSIP/${forward.number}@fritzbox`;
  const rest = Math.max(5, ringSeconds - forward.afterSeconds);
  return [
    ...(forward.afterSeconds ? ring(desks, forward.afterSeconds) : []),
    ...ring([desks, mobile].filter(Boolean).join("&"), rest),
  ];
};

/** Extension names from IP phones' user names; others keep the first line's desk phones. */
const SAFE_EXTEN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * "ringing" for the first line, and "ringing-<user>" for an extra line whose desk phones differ:
 * the call jumps there by the line it came in on.
 */
const ringingExtensions = (config: BoxConfig, caller: [string, string][]) => {
  const steps = (line: string | null) => [
    report("ringing", "in", [...caller, ["Choice", `\${KONTEXT_CHOICE}`]]),
    // After the menu the call is answered already: the caller hears a ringing tone from here.
    config.menu ? "Playtones(ring)" : "Ringing()",
    ...waitForAnswer(config, desksFor(config, line)),
    config.mailbox ? "Goto(kontext-mailbox,s,1)" : "Hangup(19)",
  ];
  const extras = config.extraLines
    .map((line) => line.username)
    .filter((name) => SAFE_EXTEN.test(name) && desksFor(config, name) !== desksFor(config, null));
  const jump = `GotoIf($[\${DIALPLAN_EXISTS(kontext-in,ringing-\${KONTEXT_LINE},1)}]?ringing-\${KONTEXT_LINE},1)`;
  return [
    extension("ringing", [...(extras.length ? [jump] : []), ...steps(null)]),
    ...extras.map((name) => extension(`ringing-${name}`, steps(name))),
  ];
};

/**
 * Recording a call: the line outside hears the notice, the box starts recording it (both ways)
 * and puts it back into the room; the file is reported at the end (kontext-ended).
 */
const recordingContext = (config: BoxConfig, paths: BoxPaths) =>
  config.recording
    ? [
        context(
          "kontext-record-call",
          extension("s", [
            ...(config.recording.notice ? [play(paths, config.recording.notice)] : []),
            `Set(KONTEXT_TALK=${paths.recordings}/\${KONTEXT_CALL}-gespraech)`,
            `MixMonitor(\${KONTEXT_TALK}.wav,a)`,
            `Dial(PJSIP/\${KONTEXT_ROOM}@livekit,30)`,
            "Hangup()",
          ]),
        ),
      ]
    : [];

/** The fax line: answered as a fax machine; the agent sends the pages to Kontext as PDF. */
const faxContext = (config: BoxConfig, paths: BoxPaths) =>
  config.fax
    ? context(
        "kontext-fax",
        extension("s", [
          report("fax", "in", [["Remote", `\${CALLERID(num)}`]]),
          "Answer()",
          `Set(KONTEXT_FAX=${paths.recordings}/\${KONTEXT_CALL})`,
          `ReceiveFAX(\${KONTEXT_FAX}.tif)`,
          "Hangup(16)",
        ]),
      )
    : "";

/** The voice menu: greeting, a key, then ringing (with the choice) or the mailbox. */
const menuContext = (config: BoxConfig, paths: BoxPaths) => {
  const { menu } = config;
  if (!menu) return "";
  return context(
    "kontext-menu",
    extension("s", [
      "Answer()",
      `Background(${paths.sounds}/${menu.greeting})`,
      `WaitExten(${menu.waitSeconds})`,
    ]),
    ...menu.options.map((option) =>
      extension(option.digit, [
        `Set(__KONTEXT_CHOICE=${option.digit})`,
        option.mailbox && config.mailbox
          ? "Goto(kontext-mailbox,s,1)"
          : "Goto(kontext-in,ringing,1)",
      ]),
    ),
    // No key, or one that means nothing: it rings as usual.
    extension("t", ["Goto(kontext-in,ringing,1)"]),
    extension("i", ["Goto(kontext-in,ringing,1)"]),
  );
};

/**
 * The block list, before anything rings: a number as the Fritzbox delivers it, in any of its
 * forms, or – when withheld numbers are blocked – none at all. Turned away with "rejected" (21).
 */
const blockCheck = ({ blocked }: BoxConfig): string[] => [
  ...(blocked.anonymous
    ? [
        `GotoIf($["\${CALLERID(num)}" = ""]?blocked,1)`,
        `GotoIf($["\${TOLOWER(\${CALLERID(num)})}" = "anonymous"]?blocked,1)`,
      ]
    : []),
  ...blocked.numbers.map((number) => `GotoIf($["\${CALLERID(num)}" = "${number}"]?blocked,1)`),
];

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
      ...blockCheck(config),
      reportEnd,
      ...(config.fax
        ? [`GotoIf($["\${KONTEXT_LINE}" = "${config.fax.line}"]?kontext-fax,s,1)`]
        : []),
      ...(config.hours
        ? hoursCheck(config)
        : [config.menu ? "Goto(kontext-menu,s,1)" : "Goto(ringing,1)"]),
    ]),
    ...ringingExtensions(config, caller),
    closed,
    config.blocked.numbers.length || config.blocked.anonymous
      ? extension("blocked", [report("blocked", "in", caller), "Hangup(21)"])
      : [],
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
const dialOut = (target: string, extra: [string, string][] = []) => [
  "Set(__KONTEXT_DIR=out)",
  "Set(CHANNEL(hangup_handler_push)=kontext-out-ended,s,1)",
  report("ringing", "out", [["Remote", `\${EXTEN}`], ...extra]),
  `Dial(${target},60,U(kontext-callee-answered))`,
  "Hangup()",
];

const THROUGH_FRITZBOX = `PJSIP/\${EXTEN}@\${KONTEXT_OUT}`;

/**
 * Calls from a desk phone: other desk phones by their short number (not reported), everything
 * else out through the Fritzbox – reported to Kontext like a call from it, with the desk phone.
 */
const fromDesks = (config: BoxConfig) => {
  if (!config.deskPhones.length) return "";
  const out = [
    `Set(__KONTEXT_CALL=\${UNIQUEID})`,
    `Set(KONTEXT_OUT=\${KONTEXT_DESK_LINE})`,
    ...dialOut(THROUGH_FRITZBOX, [["Desk", `\${KONTEXT_DESK}`]]),
  ];
  return context(
    "kontext-desk",
    ...config.deskPhones.map((desk) =>
      extension(desk.extension, [`Dial(PJSIP/${deskEndpoint(desk.id)},30)`, "Hangup()"]),
    ),
    extension("_X.", [...whichDesk(config.deskPhones), ...out]),
    extension("_**X.", [...whichDesk(config.deskPhones), ...out]),
  );
};

/** Which desk phone calls, and the line it calls out with. */
const whichDesk = (desks: DeskPhone[]) => [
  `Set(KONTEXT_DESK=\${CUT(CHANNEL(endpoint),-,2)})`,
  `Set(KONTEXT_DESK_LINE=fritzbox)`,
  ...desks
    .filter((desk) => desk.outLine)
    .map(
      (desk) =>
        `ExecIf($["\${KONTEXT_DESK}" = "${desk.id}"]?Set(KONTEXT_DESK_LINE=fritzbox-${desk.outLine}))`,
    ),
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
        "StopPlaytones()",
        report("answered", "in"),
        `Dial(PJSIP/\${KONTEXT_ROOM}@livekit,30)`,
        "Hangup()",
      ]),
    ),
    // The door intercom: picked up only to send the opening code, then hung up.
    context(
      "kontext-door-open",
      extension("s", [
        "Answer()",
        report("answered", "in"),
        "Wait(1)",
        `SendDTMF(\${KONTEXT_DTMF},250)`,
        "Wait(2)",
        "Hangup(16)",
      ]),
    ),
    ...recordingContext(config, paths),
    // Held: the line outside hears music, out of Kontext's room …
    context("kontext-hold", extension("s", ["MusicOnHold()"])),
    // … and back into it (the agent sets ${KONTEXT_ROOM} again).
    context(
      "kontext-resume",
      extension("s", [`Dial(PJSIP/\${KONTEXT_ROOM}@livekit,30)`, "Hangup()"]),
    ),
    // Numbers, the Fritzbox's own telephones by their internal number ("**610") and the desk
    // phones at the box by theirs.
    context(
      "kontext-out",
      ...config.deskPhones.map((desk) =>
        extension(desk.extension, dialOut(`PJSIP/${deskEndpoint(desk.id)}`)),
      ),
      extension("_X.", dialOut(THROUGH_FRITZBOX)),
      extension("_**X.", dialOut(THROUGH_FRITZBOX)),
    ),
    fromDesks(config),
    context(
      "kontext-callee-answered",
      extension("s", [report("answered", "out"), reportEnd, "Return()"]),
    ),
    // Answered while it rang here: at a desk phone ("desk-…") or the mobile phone ("fritzbox").
    context(
      "kontext-answered-here",
      extension("s", [
        report("answered", "in", [["Endpoint", `\${CHANNEL(endpoint)}`]]),
        "Return()",
      ]),
    ),
    context(
      "kontext-ended",
      extension("s", [
        report("ended", `\${KONTEXT_DIR}`, [
          ["Cause", `\${HANGUPCAUSE}`],
          ["Recording", `\${RECORDED_FILE}`],
          ["Fax", `\${KONTEXT_FAX}`],
          ["Talk", `\${KONTEXT_TALK}`],
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
    menuContext(config, paths),
    faxContext(config, paths),
  ].join("\n");
