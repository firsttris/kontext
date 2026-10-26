/** Which addresses the server may post to (server only: it needs Node's address parsing). */
import { isIP } from "node:net";

const isPrivateIPv4 = (address: string): boolean => {
  const [a = 0, b = 0] = address.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
};

/** A dotted IPv4 tail as two 16-bit groups. */
const dottedToGroups = (dotted: string): number[] => {
  const [a = 0, b = 0, c = 0, d = 0] = dotted.split(".").map(Number);
  return [(a << 8) | b, (c << 8) | d];
};

/** The eight 16-bit groups of a valid IPv6 address, in whatever form it is written. */
const ipv6Groups = (address: string): number[] => {
  const parse = (part: string) =>
    part
      .split(":")
      .filter(Boolean)
      .flatMap((group) => (group.includes(".") ? dottedToGroups(group) : [parseInt(group, 16)]));
  const [head = "", tail] = address.split("::");
  const front = parse(head);
  const back = tail === undefined ? [] : parse(tail);
  return [...front, ...Array<number>(8 - front.length - back.length).fill(0), ...back];
};

const groupsToIPv4 = (high: number, low: number) =>
  [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");

/**
 * The IPv4 address an IPv6 address carries in its last 32 bits, for the prefixes that reach
 * IPv4: IPv4-mapped `::ffff:0:0/96` and IPv4-compatible `::/96` (RFC 4291 2.5.5), and the NAT64
 * well-known prefix `64:ff9b::/96` (RFC 6052 2.1). Matched on the groups, not the text, because
 * WHATWG URL writes `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]`.
 */
const embeddedIPv4 = (groups: number[]): string | null => {
  const [g0, g1, g2, g3, g4, g5, g6 = 0, g7 = 0] = groups;
  const zeroUpTo4 = g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (g0 === 0 && zeroUpTo4 && (g5 === 0xffff || g5 === 0)) return groupsToIPv4(g6, g7);
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return groupsToIPv4(g6, g7);
  }
  return null;
};

const isPrivateIPv6 = (address: string): boolean => {
  const groups = ipv6Groups(address);
  const ipv4 = embeddedIPv4(groups);
  if (ipv4) return isPrivateIPv4(ipv4);
  const first = groups[0] ?? 0;
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7, unique local
    (first & 0xffc0) === 0xfe80 || // fe80::/10, link-local
    (first & 0xff00) === 0xff00 // ff00::/8, multicast
  );
};

/** Addresses inside a network, the server's own included: never posted to from here. */
export const isPrivateAddress = (address: string): boolean => {
  const kind = isIP(address);
  if (kind === 4) return isPrivateIPv4(address);
  if (kind === 6) return isPrivateIPv6(address);
  return true;
};
