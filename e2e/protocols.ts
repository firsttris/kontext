/**
 * Minimal IMAP, WebDAV and SMTP clients for the tests: what a phone or Thunderbird does with the
 * same server, or a mail server on the internet delivering a mail, without the web app in between.
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

export const SMTP_PORT = 20025;

const encodeWord = (text: string) => `=?UTF-8?B?${Buffer.from(text).toString("base64")}?=`;

/**
 * Delivers a mail over SMTP without logging in, like a mail server on the internet. The test
 * Stalwart treats this port like port 25 (dev/stalwart.ts), so it checks the sender and writes
 * Authentication-Results on top of the mail.
 */
export const deliverMail = (mail: {
  from: string;
  fromName: string;
  to: string;
  subject: string;
  body: string;
  replyTo?: string;
}): Promise<void> =>
  new Promise((resolve, reject) => {
    const message = [
      `From: ${encodeWord(mail.fromName)} <${mail.from}>`,
      `To: <${mail.to}>`,
      ...(mail.replyTo ? [`Reply-To: <${mail.replyTo}>`] : []),
      `Subject: ${encodeWord(mail.subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@mail.example.test>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      mail.body,
    ].join("\r\n");
    const steps = [
      "EHLO mail.example.test",
      `MAIL FROM:<${mail.from}>`,
      `RCPT TO:<${mail.to}>`,
      "DATA",
      `${message}\r\n.`,
      "QUIT",
    ];
    const socket = connect(SMTP_PORT, "127.0.0.1");
    let buffer = "";
    let step = 0;
    socket.setEncoding("utf8");
    socket.setTimeout(10_000, () => socket.destroy(new Error("SMTP timeout")));
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      // A reply is complete with its last line: code, space, text.
      const last = buffer.trimEnd().split("\r\n").at(-1) ?? "";
      if (!/^\d{3} /.test(last)) return;
      buffer = "";
      if (!/^[23]/.test(last)) {
        socket.destroy(new Error(`SMTP: ${last}`));
        return;
      }
      if (step < steps.length) socket.write(`${steps[step++]}\r\n`);
    });
    socket.on("close", (failed) => (failed ? undefined : resolve()));
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
