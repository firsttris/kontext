/**
 * Whether a host the server is told to connect to lies on the internet: every address it resolves
 * to is a public one. Unsubscribe links, key lookups and external mail servers go only there, so
 * nobody can make the server reach Stalwart, the cloud's metadata or another machine inside.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateAddress } from "./unsubscribe/private-address";

export type Resolve = (host: string) => Promise<string[]>;

/** The internet's DNS (an address stands for itself). */
export const dnsResolve: Resolve = async (host) =>
  (await lookup(host, { all: true })).map((entry) => entry.address);

export const isInternetHost = async (host: string, resolve: Resolve = dnsResolve) => {
  const addresses = await resolve(host.replace(/^\[|\]$/g, "")).catch(() => []);
  return addresses.length > 0 && !addresses.some(isPrivateAddress);
};

/** What the forms say when a server is not on the internet. */
export const NOT_ON_INTERNET = "Diesen Server erreicht Kontext nicht: Er liegt nicht im Internet.";

/** Where to connect: one checked address, and the host's name for TLS (none for an address). */
export type Pinned = { address: string; servername?: string };

/**
 * One of a host's addresses, checked to be public – or null. Connecting to that very address, not
 * to the name again, leaves no gap for the name to point inside meanwhile (DNS rebinding); TLS
 * still checks the certificate against the name.
 */
export const pinHost = async (
  host: string,
  resolve: Resolve = dnsResolve,
): Promise<Pinned | null> => {
  const bare = host.replace(/^\[|\]$/g, "");
  const addresses = await resolve(bare).catch(() => []);
  if (!addresses.length || addresses.some(isPrivateAddress)) return null;
  return { address: addresses[0]!, ...(isIP(bare) ? {} : { servername: bare }) };
};
