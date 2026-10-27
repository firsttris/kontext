/**
 * The Fritzbox's address as Asterisk gets it. "fritz.box" resolves to the Fritzbox's IPv6 address
 * too, and Asterisk picks that one; the box's transports are IPv4 (0.0.0.0:5070), so the REGISTER
 * never leaves ("No response received") and calls in from the IPv4 address would match no
 * endpoint. A name is therefore resolved to IPv4 each time the configuration is written.
 */
import { isIP } from "node:net";
import type { BoxConfig } from "../../server/phone/protocol";

export type LookupIpv4 = (host: string) => Promise<string>;

/** The configuration with the registrar as an IPv4 address; a name that does not resolve stays. */
export const withIpv4Registrar = async (
  config: BoxConfig,
  lookupIpv4: LookupIpv4,
): Promise<BoxConfig> => {
  const { line } = config;
  if (!line || isIP(line.registrar)) return config;
  const address = await lookupIpv4(line.registrar).catch(() => line.registrar);
  return { ...config, line: { ...line, registrar: address } };
};
