/**
 * The mails telephony writes into a mailbox: a message left on the mailbox (with the recording as
 * WAV) and a fax (as PDF) – RFC 5322 with MIME, RFC 2045–2047. Pure.
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

/** A mail Kontext writes into a mailbox in its own name, with one attachment. */
const mailWithAttachment = (
  {
    to,
    at,
    subject,
    text,
    file,
  }: {
    to: string;
    at: Date;
    subject: string;
    text: string;
    file: { name: string; type: string; bytes: Uint8Array };
  },
  boundary: string,
): Uint8Array => {
  const domain = to.split("@")[1] ?? "kontext";
  const lines = [
    `From: ${encodeWord("Kontext Telefon")} <${to}>`,
    `To: <${to}>`,
    `Subject: ${encodeWord(subject)}`,
    `Date: ${at.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <phone-${crypto.randomUUID()}@${domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(new TextEncoder().encode(text)),
    `--${boundary}`,
    `Content-Type: ${file.type}; name="${file.name}"`,
    `Content-Disposition: attachment; filename="${file.name}"`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(file.bytes),
    `--${boundary}--`,
    "",
  ];
  return new TextEncoder().encode(lines.join("\r\n"));
};

const callerOf = (remote: string) => (remote ? readableNumber(remote) : "unbekannter Nummer");
const fileNumber = (remote: string) => remote.replace(/\D/g, "") || "unbekannt";

export const voicemailMessage = (
  mail: Voicemail,
  boundary: string = crypto.randomUUID(),
): Uint8Array => {
  const caller = callerOf(mail.remote);
  const length = soundLength(mail.seconds);
  return mailWithAttachment(
    {
      to: mail.to,
      at: mail.at,
      subject: `Nachricht von ${caller} (${length})`,
      text: [
        `${mail.remote ? `${caller} hat` : "Jemand mit unterdrückter Nummer hat"} am ${berlin(mail.at)} Uhr angerufen und eine Nachricht hinterlassen (${length}).`,
        "",
        "Die Aufnahme hängt an dieser Mail; in Kontext steht sie auch unter Telefon.",
      ].join("\r\n"),
      file: {
        name: `Nachricht-${fileNumber(mail.remote)}.wav`,
        type: "audio/wav",
        bytes: mail.wav,
      },
    },
    boundary,
  );
};

export type Fax = { remote: string; to: string; at: Date; pdf: Uint8Array };

export const faxMessage = (fax: Fax, boundary: string = crypto.randomUUID()): Uint8Array =>
  mailWithAttachment(
    {
      to: fax.to,
      at: fax.at,
      subject: `Fax von ${callerOf(fax.remote)}`,
      text: [
        `Am ${berlin(fax.at)} Uhr kam ein Fax von ${callerOf(fax.remote)}.`,
        "",
        "Es hängt als PDF an dieser Mail; in Kontext steht es auch unter Telefon.",
      ].join("\r\n"),
      file: { name: `Fax-${fileNumber(fax.remote)}.pdf`, type: "application/pdf", bytes: fax.pdf },
    },
    boundary,
  );
