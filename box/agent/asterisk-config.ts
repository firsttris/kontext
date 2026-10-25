/**
 * Asterisk's configuration, written whole from what Kontext wants (config.desired): the box signs
 * in at the Fritzbox as an IP phone, sends calls into Kontext over the SIP trunk to LiveKit SIP,
 * and reports every step on the manager interface (AMI, localhost only) as a UserEvent the agent
 * turns into call events. Pure.
 *
 * - Incoming (context kontext-in): the call rings here until someone answers in Kontext; then the
 *   agent moves it to kontext-answer, which dials LiveKit SIP with the room's id as the number
 *   (LiveKit's dispatch_rule_callee puts it into "kontext-phone-<id>"). The caller is connected
 *   only then, so the desk phones keep ringing until someone takes it.
 * - Outgoing: the agent originates a call to LiveKit SIP (the room Kontext named) and, once that
 *   leg is up, kontext-out dials the number through the Fritzbox.
 * - Mailbox (kontext-mailbox): when nobody answered in time, the box picks up, plays the greeting
 *   and records a message; the agent uploads it when the caller hangs up.
 */
import type { BoxConfig } from "../../server/phone/protocol";

export type AmiLogin = { username: string; secret: string; port: number };

/** Where the box keeps the sounds from Kontext and the messages it records. */
export type BoxPaths = { sounds: string; recordings: string };

/** One `key=value` section of an Asterisk .conf file. */
const section = (name: string, entries: [string, string | number][]) =>
  [`[${name}]`, ...entries.map(([key, value]) => `${key}=${value}`), ""].join("\n");

/** Values come from Kontext; nothing in them may open a new line or section. */
const safe = (value: string) => value.replace(/[\r\n[\];]/g, "");

const SIP_PORT = 5070;

export const pjsipConf = (config: BoxConfig): string => {
  const parts = [
    section("transport-udp", [
      ["type", "transport"],
      ["protocol", "udp"],
      ["bind", `0.0.0.0:${SIP_PORT}`],
    ]),
    section("transport-tcp", [
      ["type", "transport"],
      ["protocol", "tcp"],
      ["bind", `0.0.0.0:${SIP_PORT}`],
    ]),
  ];
  const { line, trunk } = config;
  if (line) {
    const registrar = safe(line.registrar);
    const username = safe(line.username);
    parts.push(
      section("fritzbox-auth", [
        ["type", "auth"],
        ["auth_type", "userpass"],
        ["username", username],
        ["password", safe(line.password)],
      ]),
      section("fritzbox-registration", [
        ["type", "registration"],
        ["transport", "transport-udp"],
        ["outbound_auth", "fritzbox-auth"],
        ["server_uri", `sip:${registrar}`],
        ["client_uri", `sip:${username}@${registrar}`],
        ["contact_user", username],
        ["retry_interval", 30],
        ["forbidden_retry_interval", 300],
        ["expiration", 300],
      ]),
      section("fritzbox", [
        ["type", "aor"],
        ["contact", `sip:${registrar}`],
      ]),
      section("fritzbox", [
        ["type", "endpoint"],
        ["transport", "transport-udp"],
        ["context", "kontext-in"],
        ["disallow", "all"],
        ["allow", "alaw,ulaw,g722"],
        ["outbound_auth", "fritzbox-auth"],
        ["aors", "fritzbox"],
        ["from_user", username],
        ["from_domain", registrar],
        ["direct_media", "no"],
        ["dtmf_mode", "rfc4733"],
      ]),
      section("fritzbox-identify", [
        ["type", "identify"],
        ["endpoint", "fritzbox"],
        ["match", registrar],
      ]),
    );
  }
  if (trunk) {
    parts.push(
      section("livekit-auth", [
        ["type", "auth"],
        ["auth_type", "userpass"],
        ["username", safe(trunk.username)],
        ["password", safe(trunk.password)],
      ]),
      section("livekit", [
        ["type", "aor"],
        ["contact", `sip:${safe(trunk.host)}:${trunk.port};transport=tcp`],
      ]),
      section("livekit", [
        ["type", "endpoint"],
        ["transport", "transport-tcp"],
        // LiveKit never calls in on its own; anything from it ends there.
        ["context", "kontext-refuse"],
        ["disallow", "all"],
        ["allow", "alaw,ulaw,g722"],
        ["outbound_auth", "livekit-auth"],
        ["aors", "livekit"],
        ["direct_media", "no"],
        // The box sits behind the customer's router: send media back where it comes from.
        ["rtp_symmetric", "yes"],
        ["force_rport", "yes"],
        ["rewrite_contact", "yes"],
        ["dtmf_mode", "rfc4733"],
      ]),
    );
  }
  return parts.join("\n");
};

/** Plays a sound from Kontext (Asterisk finds the .wav itself). */
const play = (paths: BoxPaths, id: string) => `Playback(${paths.sounds}/${id})`;

/** After ringing in vain: the greeting, a beep, up to maxSeconds of message, ended by silence. */
const mailboxContext = (config: BoxConfig, paths: BoxPaths) => {
  const { mailbox } = config;
  if (!mailbox) return "";
  return `
[kontext-mailbox]
exten => s,1,Answer()
 same => n,UserEvent(KontextCall,Call: \${KONTEXT_CALL},State: mailbox,Direction: in)
${mailbox.greeting ? ` same => n,${play(paths, mailbox.greeting)}\n` : ""} same => n,Record(${paths.recordings}/\${KONTEXT_CALL}.wav,4,${mailbox.maxSeconds},k)
 same => n,Hangup(16)
exten => h,1,UserEvent(KontextCall,Call: \${KONTEXT_CALL},State: ended,Direction: in,Cause: \${HANGUPCAUSE},Recording: \${RECORDED_FILE})
`;
};

/** The dialplan. ${KONTEXT_ROOM} is set by the agent before it moves a call. */
export const extensionsConf = (config: BoxConfig, paths: BoxPaths): string => `[general]
static=yes
writeprotect=yes

[globals]

[kontext-in]
exten => _[+0-9a-zA-Z].,1,Goto(ring,1)
exten => s,1,Goto(ring,1)
exten => ring,1,Set(__KONTEXT_CALL=\${UNIQUEID})
 same => n,UserEvent(KontextCall,Call: \${KONTEXT_CALL},State: ringing,Direction: in,Remote: \${CALLERID(num)},Local: \${CALLERID(dnid)})
 same => n,Ringing()
 same => n,Wait(${config.ringSeconds})
 same => n,${config.mailbox ? "Goto(kontext-mailbox,s,1)" : "Hangup(19)"}
exten => h,1,UserEvent(KontextCall,Call: \${KONTEXT_CALL},State: ended,Direction: in,Cause: \${HANGUPCAUSE})

[kontext-answer]
exten => answer,1,UserEvent(KontextCall,Call: \${KONTEXT_CALL},State: answered,Direction: in)
 same => n,Dial(PJSIP/\${KONTEXT_ROOM}@livekit,30)
 same => n,Hangup()
exten => h,1,UserEvent(KontextCall,Call: \${KONTEXT_CALL},State: ended,Direction: in,Cause: \${HANGUPCAUSE})

[kontext-out]
exten => _X.,1,UserEvent(KontextCall,Call: \${KONTEXT_CALL},State: ringing,Direction: out,Remote: \${EXTEN})
 same => n,Dial(PJSIP/\${EXTEN}@fritzbox,60,U(kontext-callee-answered))
 same => n,Hangup()
exten => h,1,UserEvent(KontextCall,Call: \${KONTEXT_CALL},State: ended,Direction: out,Cause: \${HANGUPCAUSE},DialStatus: \${DIALSTATUS})

[kontext-callee-answered]
exten => s,1,UserEvent(KontextCall,Call: \${KONTEXT_CALL},State: answered,Direction: out)
 same => n,Return()

[kontext-refuse]
exten => _.,1,Hangup(21)
${mailboxContext(config, paths)}`;

export const managerConf = (ami: AmiLogin): string =>
  [
    section("general", [
      ["enabled", "yes"],
      ["port", ami.port],
      // Only the agent in the same container (host network) talks to it.
      ["bindaddr", "127.0.0.1"],
    ]),
    section(ami.username, [
      ["secret", safe(ami.secret)],
      ["deny", "0.0.0.0/0.0.0.0"],
      ["permit", "127.0.0.1/255.255.255.255"],
      ["read", "system,call,user"],
      ["write", "system,call,originate"],
    ]),
  ].join("\n");

/** All files Asterisk reads, by name in /etc/asterisk. */
export const asteriskFiles = (
  config: BoxConfig,
  ami: AmiLogin,
  paths: BoxPaths,
): Record<string, string> => ({
  "pjsip.conf": pjsipConf(config),
  "extensions.conf": extensionsConf(config, paths),
  "manager.conf": managerConf(ami),
});
