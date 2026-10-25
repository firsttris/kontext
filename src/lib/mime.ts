/**
 * A mail as MIME text (RFC 2045–2049, RFC 5322), built in the app where the server must not see
 * the content: the inner part of an encrypted mail (text, HTML, attachments), and the outer
 * PGP/MIME envelope (RFC 3156) around what OpenPGP made of it. Pure.
 */
import { replyReferences } from "./references";

export type MimeAddress = { name: string | null; email: string };
export type MimeAttachment = { name: string; type: string; bytes: Uint8Array };

const encoder = new TextEncoder();

export const base64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const lines = (text: string) => (text.match(/.{1,76}/g) ?? []).join("\r\n");

/** "=?UTF-8?B?…?=" where a header has more than ASCII (RFC 2047). */
export const encodeWord = (text: string): string =>
  /^[\x20-\x7e]*$/.test(text) ? text : `=?UTF-8?B?${base64(encoder.encode(text))}?=`;

/** Specials and the backslash are not atext, so such a name goes in quotes, where `\` and `"`
 * are written as quoted-pairs (RFC 5322 3.2.3, 3.2.4). */
export const mailbox = ({ name, email }: MimeAddress) =>
  name
    ? `${/[(),.:;<>@[\]"\\]/.test(name) && /^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/[\\"]/g, "\\$&")}"` : encodeWord(name)} <${email}>`
    : `<${email}>`;

/** A file name parameter, as RFC 2231 for more than ASCII. */
const fileName = (name: string) =>
  /^[\x20-\x7e]*$/.test(name) && !/["\\]/.test(name)
    ? `name="${name}"`
    : `name*=UTF-8''${encodeURIComponent(name)}`;

const textPart = (type: string, text: string) =>
  [
    `Content-Type: ${type}; charset=utf-8`,
    "Content-Transfer-Encoding: base64",
    "",
    lines(base64(encoder.encode(text.replace(/\r?\n/g, "\r\n")))),
  ].join("\r\n");

const multipart = (type: string, boundary: string, parts: string[], params = "") =>
  [
    `Content-Type: multipart/${type}; boundary="${boundary}"${params}`,
    "",
    ...parts.flatMap((part) => [`--${boundary}`, part]),
    `--${boundary}--`,
    "",
  ].join("\r\n");

/** The content of a mail: text and HTML as alternatives, attachments after. */
export const contentPart = (
  { text, html, attachments }: { text: string; html: string; attachments: MimeAttachment[] },
  id: string,
): string => {
  const alternative = multipart("alternative", `alt-${id}`, [
    textPart("text/plain", text),
    textPart("text/html", html),
  ]);
  if (!attachments.length) return alternative;
  return multipart("mixed", `mix-${id}`, [
    alternative,
    ...attachments.map((file) =>
      [
        `Content-Type: ${file.type || "application/octet-stream"}; ${fileName(file.name)}`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; ${fileName(file.name).replace(/^name/, "filename")}`,
        "",
        lines(base64(file.bytes)),
      ].join("\r\n"),
    ),
  ]);
};

/** The subject an encrypted mail shows outside: the real one is inside (Protected Headers). */
export const PROTECTED_SUBJECT = "Vertrauliche Nachricht";

export type Envelope = {
  from: MimeAddress;
  to: MimeAddress[];
  cc: MimeAddress[];
  subject: string;
  date: Date;
  messageId: string;
  inReplyTo?: string[] | null;
  references?: string[] | null;
  /** Further header lines as they are (e.g. Autocrypt), already folded. */
  extra?: string[];
};

const headers = (mail: Envelope) => [
  `From: ${mailbox(mail.from)}`,
  ...(mail.to.length ? [`To: ${mail.to.map(mailbox).join(", ")}`] : []),
  ...(mail.cc.length ? [`Cc: ${mail.cc.map(mailbox).join(", ")}`] : []),
  `Subject: ${encodeWord(mail.subject)}`,
  `Date: ${mail.date.toUTCString().replace("GMT", "+0000")}`,
  `Message-ID: <${mail.messageId}>`,
  ...(mail.inReplyTo?.length
    ? [`In-Reply-To: ${mail.inReplyTo.map((id) => `<${id}>`).join(" ")}`]
    : []),
  ...(mail.references?.length || mail.inReplyTo?.length
    ? [
        `References: ${replyReferences(mail.references, mail.inReplyTo)
          .map((id) => `<${id}>`)
          .join(" ")}`,
      ]
    : []),
  ...(mail.extra ?? []),
  "MIME-Version: 1.0",
];

/**
 * The content part with the mail's own headers inside it, marked as protected headers
 * (draft-ietf-lamps-header-protection, as Thunderbird does): after decrypting, the real subject
 * is there, while the outer one is only `PROTECTED_SUBJECT`.
 */
export const protectHeaders = (entity: string, mail: Envelope): string => {
  const [first = "", ...rest] = entity.split("\r\n");
  return [
    `${first}; protected-headers="v1"`,
    `Subject: ${encodeWord(mail.subject)}`,
    `From: ${mailbox(mail.from)}`,
    ...(mail.to.length ? [`To: ${mail.to.map(mailbox).join(", ")}`] : []),
    ...(mail.cc.length ? [`Cc: ${mail.cc.map(mailbox).join(", ")}`] : []),
    `Message-ID: <${mail.messageId}>`,
    ...rest,
  ].join("\r\n");
};

/** The envelope as it goes outside an encrypted mail: the subject hidden. */
export const outerEnvelope = (mail: Envelope): Envelope => ({
  ...mail,
  subject: PROTECTED_SUBJECT,
});

/**
 * A mail signed with PGP, not encrypted (RFC 3156 §5): the content part as it is, then the
 * detached signature over exactly its bytes.
 */
export const pgpSignedMail = (
  mail: Envelope,
  entity: string,
  armoredSignature: string,
  id: string,
): string =>
  [
    ...headers(mail),
    multipart(
      "signed",
      `sig-${id}`,
      [
        entity.replace(/\r\n$/, ""),
        [
          'Content-Type: application/pgp-signature; name="signature.asc"',
          "Content-Description: OpenPGP digital signature",
          'Content-Disposition: attachment; filename="signature.asc"',
          "",
          armoredSignature.replace(/\r?\n/g, "\r\n"),
        ].join("\r\n"),
      ],
      '; protocol="application/pgp-signature"; micalg=pgp-sha256',
    ),
  ].join("\r\n");

/** The whole mail around an entity S/MIME made (RFC 8551): what goes to the server. */
export const withHeaders = (mail: Envelope, entity: string): string =>
  [...headers(mail), entity].join("\r\n");

/** The whole mail around PGP's armored message (RFC 3156 §4): what goes to the server. */
export const encryptedMail = (mail: Envelope, armored: string, id: string): string =>
  [
    ...headers(mail),
    multipart(
      "encrypted",
      `enc-${id}`,
      [
        [
          "Content-Type: application/pgp-encrypted",
          "Content-Description: PGP/MIME version identification",
          "",
          "Version: 1",
          "",
        ].join("\r\n"),
        [
          'Content-Type: application/octet-stream; name="encrypted.asc"',
          "Content-Description: OpenPGP encrypted message",
          'Content-Disposition: inline; filename="encrypted.asc"',
          "",
          armored.replace(/\r?\n/g, "\r\n"),
        ].join("\r\n"),
      ],
      '; protocol="application/pgp-encrypted"',
    ),
  ].join("\r\n");
