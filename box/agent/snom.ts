/**
 * Provisioning for Snom desk phones: the phone fetches its settings from the box once its
 * "Setting URL" points to http://<box>:8089/snom/{mac}.xml – its SIP account at the box, German
 * language, tones and time zone. Snom's XML settings format (snom "XML provisioning"). Pure.
 */
import type { DeskPhone } from "../../server/phone/protocol";
import { deskEndpoint } from "./dialplan";

const xml = (text: string) =>
  text.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );

/** The MAC from the provisioning path, as the box keeps it ("000413a1b2c3"); null otherwise. */
export const macOfPath = (path: string): string | null => {
  const match = path.match(/^\/snom\/(?:snom[^-]*-)?([0-9A-Fa-f]{12})\.(?:xml|htm)$/);
  return match ? match[1]!.toLowerCase() : null;
};

/** `withPassword` false: the phone keeps the password it has (handed-out.ts). */
export const snomSettings = (
  desk: DeskPhone,
  boxHost: string,
  sipPort: number,
  withPassword = true,
): string => {
  const settings: [string, string][] = [
    ['user_active idx="1"', "on"],
    ['user_realname idx="1"', desk.label],
    ['user_name idx="1"', deskEndpoint(desk.id)],
    ['user_pname idx="1"', deskEndpoint(desk.id)],
    ...(withPassword ? [['user_pass idx="1"', desk.password] as [string, string]] : []),
    ['user_host idx="1"', `${boxHost}:${sipPort}`],
    ['user_idle_text idx="1"', `${desk.label} (${desk.extension})`],
    ["language", "Deutsch"],
    ["web_language", "Deutsch"],
    ["tone_scheme", "GER"],
    ["timezone", "GER+1"],
    ["date_us_format", "off"],
    ["time_24_format", "on"],
  ];
  const lines = settings.map(([key, value]) => {
    const name = key.split(" ")[0];
    return `    <${key} perm="RW">${xml(value)}</${name}>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>\n<settings>\n  <phone-settings>\n${lines.join("\n")}\n  </phone-settings>\n</settings>\n`;
};
