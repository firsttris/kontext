/**
 * The S/MIME check's requests to authorities: OCSP (POST) and revocation lists (GET), over http or
 * https – what they answer is signed –, to hosts on the internet only, briefly, and limited in size.
 */
import { lookup } from "node:dns/promises";
import { isPrivateAddress } from "../unsubscribe/private-address";

/** Whether `url` is http(s) to a host that resolves to public addresses only. */
const publicTarget = async (url: string): Promise<URL | null> => {
  const target = new URL(url);
  if (!/^https?:$/.test(target.protocol)) return null;
  const addresses = (await lookup(target.hostname, { all: true }).catch(() => [])).map(
    (entry) => entry.address,
  );
  return addresses.length && !addresses.some(isPrivateAddress) ? target : null;
};

/** The body up to `max` bytes; null when it is longer (read in pieces, stopped early). */
export const readLimited = async (response: Response, max: number): Promise<Uint8Array | null> => {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > max || !response.body) return null;
  const pieces: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    pieces.push(value);
  }
  return new Uint8Array(Buffer.concat(pieces));
};

export const ocspPost = async (url: string, body: Uint8Array): Promise<Uint8Array | null> => {
  const target = await publicTarget(url).catch(() => null);
  if (!target) return null;
  const response = await fetch(target, {
    method: "POST",
    headers: { "content-type": "application/ocsp-request" },
    body: body as Uint8Array<ArrayBuffer>,
    redirect: "error",
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  return response?.ok ? readLimited(response, 100_000) : null;
};

/** Revocation lists of large authorities run to a few megabytes. */
export const CRL_MAX_BYTES = 10 * 1024 * 1024;

export const crlGet = async (url: string): Promise<Uint8Array | null> => {
  const target = await publicTarget(url).catch(() => null);
  if (!target) return null;
  const response = await fetch(target, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  return response?.ok ? readLimited(response, CRL_MAX_BYTES).catch(() => null) : null;
};
