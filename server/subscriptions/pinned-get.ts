/**
 * A GET over https to one checked address (pinHost in internet-host.ts): the connection goes to
 * that very address and not to the name again, so the name cannot point inside meanwhile (DNS
 * rebinding). TLS still checks the certificate against the name in the URL.
 */
import { request } from "node:https";
import { isIP, type LookupFunction } from "node:net";
import { Readable } from "node:stream";

export type Get = (
  url: URL,
  init: { redirect: "manual"; headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>;

/** Statuses a Response may not carry a body with. */
const NO_BODY = new Set([204, 205, 304]);

export const pinnedGet =
  (address: string): Get =>
  (url, { headers, signal }) =>
    new Promise((resolve, reject) => {
      const family = isIP(address);
      const lookup: LookupFunction = (_host, options, callback) =>
        options.all ? callback(null, [{ address, family }]) : callback(null, address, family);
      const outgoing = request(url, { headers, signal, lookup }, (incoming) => {
        const status = incoming.statusCode ?? 502;
        const received = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          for (const one of [value ?? []].flat()) received.append(name, one);
        }
        if (NO_BODY.has(status)) incoming.resume();
        const body = NO_BODY.has(status)
          ? null
          : (Readable.toWeb(incoming) as unknown as ReadableStream);
        resolve(new Response(body, { status, headers: received }));
      });
      outgoing.on("error", reject);
      outgoing.end();
    });
