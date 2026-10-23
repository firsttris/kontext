/**
 * Minimal IMAP and WebDAV clients for the integration tests: what a phone or Thunderbird does
 * with the same server, without the web app in between.
 */
import { connect } from "node:net";
import { DEV_PASSWORD } from "../dev/config";
import { address, STALWART } from "./helpers";

export const IMAP_PORT = 20143;

/** Runs IMAP commands one after the other and returns each command's full response. */
export const imap = (user: string, commands: string[]): Promise<string[]> =>
  new Promise((resolve, reject) => {
    const socket = connect(IMAP_PORT, "127.0.0.1");
    const all = [`LOGIN "${address(user)}" "${DEV_PASSWORD}"`, ...commands, "LOGOUT"];
    const responses: string[] = [];
    let buffer = "";
    let step = -1;
    const next = () => {
      step++;
      if (step < all.length) socket.write(`t${step} ${all[step]}\r\n`);
    };
    socket.setEncoding("utf8");
    socket.setTimeout(10_000, () => socket.destroy(new Error(`IMAP timeout at ${all[step]}`)));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      if (step === -1 && buffer.includes("\r\n")) {
        buffer = "";
        next();
        return;
      }
      const done = new RegExp(`^t${step} (OK|NO|BAD)`, "m");
      if (done.test(buffer)) {
        responses.push(buffer);
        buffer = "";
        if (step === all.length - 1) socket.end();
        else next();
      }
    });
    socket.on("end", () => resolve(responses.slice(1, -1)));
    socket.on("error", reject);
  });

/** A WebDAV request as the user (CalDAV, CardDAV). */
export const dav = async (
  user: string,
  method: "PROPFIND" | "REPORT" | "GET",
  path: string,
  body?: string,
): Promise<{ status: number; text: string }> => {
  const response = await fetch(`${STALWART}${path}`, {
    method,
    headers: {
      authorization: `Basic ${btoa(`${address(user)}:${DEV_PASSWORD}`)}`,
      "content-type": "application/xml; charset=utf-8",
      depth: "1",
    },
    body,
  });
  return { status: response.status, text: await response.text() };
};

export const davHome = (kind: "cal" | "card", user: string) =>
  `/dav/${kind}/${encodeURIComponent(address(user))}/default/`;
