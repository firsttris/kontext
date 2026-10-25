/**
 * The mail a message on the mailbox becomes: who called when, how long, and the recording as a
 * WAV attachment (RFC 5322 with MIME, RFC 2045–2047). Pure.
 */
import { readableNumber } from "./numbers";
import { soundLength } from "./sounds";

export type Voicemail = {
  /** The caller's number in E.164, "" when withheld. */
  remote: string;
  /** Where the mail goes, also its sender: Kontext writes it in the mailbox's own name. */
  to: string;
  at: Date;
  seconds: number;
  wav: Uint8Array;
};

/** Non-ASCII header text as an encoded word (RFC 2047). */
export const encodeWord = (text: string): string =>
  /^[ -~]*$/.test(text) ? text : `=?UTF-8?B?${Buffer.from(text, "utf8").toString("base64")}?=`;

/** Base64 in lines of 76, as MIME wants it. */
const base64Lines = (bytes: Uint8Array) =>
  (
    Buffer.from(bytes)
      .toString("base64")
      .match(/.{1,76}/g) ?? []
  ).join("\r\n");

const berlin = (at: Date) =>
  at.toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

export const voicemailMessage = (
  mail: Voicemail,
  boundary: string = crypto.randomUUID(),
): Uint8Array => {
  const caller = mail.remote ? readableNumber(mail.remote) : "unbekannter Nummer";
  const length = soundLength(mail.seconds);
  const subject = `Nachricht von ${caller} (${length})`;
  const file = `Nachricht-${(mail.remote || "unbekannt").replace(/\D/g, "") || "unbekannt"}.wav`;
  const domain = mail.to.split("@")[1] ?? "kontext";
  const text = [
    `${mail.remote ? `${caller} hat` : "Jemand mit unterdrückter Nummer hat"} am ${berlin(mail.at)} Uhr angerufen und eine Nachricht hinterlassen (${length}).`,
    "",
    "Die Aufnahme hängt an dieser Mail; in Kontext steht sie auch unter Telefon.",
  ].join("\r\n");
  const lines = [
    `From: ${encodeWord("Kontext Telefon")} <${mail.to}>`,
    `To: <${mail.to}>`,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${mail.at.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <voicemail-${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(new TextEncoder().encode(text)),
    `--${boundary}`,
    `Content-Type: audio/wav; name="${file}"`,
    `Content-Disposition: attachment; filename="${file}"`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(mail.wav),
    `--${boundary}--`,
    "",
  ];
  return new TextEncoder().encode(lines.join("\r\n"));
};
