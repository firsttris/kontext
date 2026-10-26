/**
 * Whether a host the server is told to connect to lies on the internet: every address it resolves
 * to is a public one. Unsubscribe links, key lookups and external mail servers go only there, so
 * nobody can make the server reach Stalwart, the cloud's metadata or another machine inside.
 */
import { lookup } from "node:dns/promises";
import { isPrivateAddress } from "./unsubscribe/private-address";

export type Resolve = (host: string) => Promise<string[]>;

/** The internet's DNS (an address stands for itself). */
export const dnsResolve: Resolve = async (host) =>
  (await lookup(host, { all: true })).map((entry) => entry.address);

export const isInternetHost = async (host: string, resolve: Resolve = dnsResolve) => {
  const addresses = await resolve(host.replace(/^\[|\]$/g, "")).catch(() => []);
  return addresses.length > 0 && !addresses.some(isPrivateAddress);
};
