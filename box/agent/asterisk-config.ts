/**
 * Asterisk's configuration, written whole from what Kontext wants (config.desired): the box signs
 * in at the Fritzbox as an IP phone, sends calls into Kontext over the SIP trunk to LiveKit SIP,
 * and reports every step on the manager interface (AMI, localhost only) as a UserEvent the agent
 * turns into call events; the dialplan itself is in dialplan.ts. Pure.
 */
import type { BoxConfig } from "../../server/phone/protocol";
import { type BoxPaths, extensionsConf } from "./dialplan";

export type { BoxPaths };
export { extensionsConf };

export type AmiLogin = { username: string; secret: string; port: number };

/** One `key=value` section of an Asterisk .conf file. */
const section = (name: string, entries: [string, string | number][]) =>
  [`[${name}]`, ...entries.map(([key, value]) => `${key}=${value}`), ""].join("\n");

/** Values come from Kontext; nothing in them may open a new line or section. */
const safe = (value: string) => value.replace(/[\r\n[\];]/g, "");

const SIP_PORT = 5070;

/** The endpoint of an extra number, for calls out with it. */
export const lineEndpoint = (id: string) => `fritzbox-${safe(id)}`;

/** One IP phone at the Fritzbox: its login, its registration and the endpoint to call out with. */
const fritzboxLine = (
  name: string,
  registrarValue: string,
  usernameValue: string,
  password: string,
  identify: boolean,
) => {
  const registrar = safe(registrarValue);
  const username = safe(usernameValue);
  return [
    section(`${name}-auth`, [
      ["type", "auth"],
      ["auth_type", "userpass"],
      ["username", username],
      ["password", safe(password)],
    ]),
    section(`${name}-registration`, [
      ["type", "registration"],
      ["transport", "transport-udp"],
      ["outbound_auth", `${name}-auth`],
      ["server_uri", `sip:${registrar}`],
      ["client_uri", `sip:${username}@${registrar}`],
      ["contact_user", username],
      ["retry_interval", 30],
      ["forbidden_retry_interval", 300],
      ["expiration", 300],
    ]),
    section(name, [
      ["type", "aor"],
      ["contact", `sip:${registrar}`],
    ]),
    section(name, [
      ["type", "endpoint"],
      ["transport", "transport-udp"],
      ["context", "kontext-in"],
      ["disallow", "all"],
      ["allow", "alaw,ulaw,g722"],
      ["outbound_auth", `${name}-auth`],
      ["aors", name],
      ["from_user", username],
      ["from_domain", registrar],
      ["direct_media", "no"],
      ["dtmf_mode", "rfc4733"],
    ]),
    ...(identify
      ? [
          section(`${name}-identify`, [
            ["type", "identify"],
            ["endpoint", name],
            ["match", registrar],
          ]),
        ]
      : []),
  ];
};

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
    parts.push(...fritzboxLine("fritzbox", line.registrar, line.username, line.password, true));
    // More numbers: more IP phones at the same Fritzbox; calls in still come through the first
    // (matched by address) and tell their line by the number dialled (contact_user).
    for (const extra of config.extraLines) {
      parts.push(
        ...fritzboxLine(
          lineEndpoint(extra.id),
          line.registrar,
          extra.username,
          extra.password,
          false,
        ),
      );
    }
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
