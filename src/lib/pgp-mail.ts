/**
 * PGP in mails (docs/encryption.md, building block 3): whether a mail is encrypted or signed,
 * reading it – decrypt, check the signature, take the inner MIME apart – and making an encrypted
 * one. OpenPGP.js and postal-mime are loaded only when a mail needs them.
 */
import type { PrivateKey } from "openpgp";
import { contentPart, type Envelope, encryptedMail, type MimeAttachment } from "./mime";

const openpgp = () => import("openpgp");
const postal = async () => (await import("postal-mime")).default;

const ARMORED = /-----BEGIN PGP MESSAGE-----[\s\S]+?-----END PGP MESSAGE-----/;

export type PgpKind = "encrypted" | "signed" | null;

/** A mail in the list that is encrypted: by its type, or a preview that is cipher text. */
export const encryptedPreview = (
  preview: string | null | undefined,
  contentType?: string | null,
): boolean =>
  /multipart\/encrypted/i.test(contentType ?? "") ||
  (/pkcs7-mime/i.test(contentType ?? "") && !/signed-data/i.test(contentType ?? "")) ||
  /^\s*(Version:\s*1\b|-----BEGIN PGP MESSAGE-----)/.test(preview ?? "");

/** PGP/MIME by the Content-Type (RFC 3156), or an armored message in the text itself. */
export const pgpKind = (contentType: string | null | undefined, text: string): PgpKind => {
  const type = (contentType ?? "").toLowerCase();
  if (type.includes("multipart/encrypted") && type.includes("pgp-encrypted")) return "encrypted";
  if (ARMORED.test(text)) return "encrypted";
  if (type.includes("multipart/signed") && type.includes("pgp-signature")) return "signed";
  return null;
};

/** Whose signature, and whether it holds. */
export type Signature =
  | { state: "valid"; fingerprint: string }
  | { state: "invalid" }
  | { state: "unknown" }
  | { state: "none" };

export type ReadMail = {
  text: string;
  html: string | null;
  attachments: { name: string; type: string; bytes: Uint8Array }[];
  signature: Signature;
};

/** The first signature checked against the sender's known keys. */
const check = async (
  signatures: { verified: Promise<unknown>; keyID: { toHex: () => string } }[],
  keys: string[],
): Promise<Signature> => {
  const [first] = signatures;
  if (!first) return { state: "none" };
  if (!keys.length) return { state: "unknown" };
  try {
    await first.verified;
    const { readKey } = await openpgp();
    const known = await Promise.all(keys.map((armoredKey) => readKey({ armoredKey })));
    const signer = known.find((key) =>
      key.getKeyIDs().some((id) => id.toHex() === first.keyID.toHex()),
    );
    return { state: "valid", fingerprint: signer?.getFingerprint().toUpperCase() ?? "" };
  } catch (error) {
    return /could not find signing key/i.test((error as Error).message)
      ? { state: "unknown" }
      : { state: "invalid" };
  }
};

/** The armored message of an encrypted mail: its encrypted.asc part, or in its text. */
const armoredOf = async (raw: string) => {
  const parsed = await (await postal()).parse(raw);
  for (const attachment of parsed.attachments) {
    const content =
      typeof attachment.content === "string"
        ? attachment.content
        : new TextDecoder().decode(attachment.content);
    const found = content.match(ARMORED)?.[0];
    if (found) return found;
  }
  return (parsed.text ?? "").match(ARMORED)?.[0] ?? raw.match(ARMORED)?.[0] ?? null;
};

/** Decrypts a mail as sent (its whole raw text) with one's unlocked key. */
export const readEncrypted = async (
  raw: string,
  key: PrivateKey,
  senderKeys: string[],
): Promise<ReadMail> => {
  const armoredMessage = await armoredOf(raw);
  if (!armoredMessage) throw new Error("Kein verschlüsselter Inhalt");
  const { decrypt, readKey, readMessage } = await openpgp();
  const verificationKeys = await Promise.all(
    senderKeys.map((armoredKey) => readKey({ armoredKey })),
  );
  const { data, signatures } = await decrypt({
    message: await readMessage({ armoredMessage }),
    decryptionKeys: key,
    verificationKeys,
  });
  const signature = await check(signatures, senderKeys);
  // PGP/MIME holds a whole MIME part; inline PGP only text.
  if (!/^[\w-]+:/m.test(data.slice(0, 500)) || !/content-type:/i.test(data.slice(0, 2000))) {
    return { text: data, html: null, attachments: [], signature };
  }
  const inner = await (await postal()).parse(`MIME-Version: 1.0\r\n${data}`);
  return {
    text: inner.text ?? "",
    html: inner.html ?? null,
    attachments: inner.attachments.map((file) => ({
      name: file.filename ?? "Anhang",
      type: file.mimeType,
      bytes:
        typeof file.content === "string"
          ? new TextEncoder().encode(file.content)
          : new Uint8Array(file.content),
    })),
    signature,
  };
};

/** The signed part and the signature of a multipart/signed mail (RFC 3156 §5). */
export const signedParts = (raw: string, contentType: string) => {
  const boundary = contentType.match(/boundary\s*=\s*"?([^";]+)"?/i)?.[1];
  if (!boundary) return null;
  const text = raw.replace(/\r?\n/g, "\r\n");
  const marker = `\r\n--${boundary}`;
  const start = text.indexOf(`--${boundary}\r\n`);
  if (start < 0) return null;
  const bodyStart = start + boundary.length + 4;
  const end = text.indexOf(marker, bodyStart);
  const signature = text
    .slice(end)
    .match(/-----BEGIN PGP SIGNATURE-----[\s\S]+?-----END PGP SIGNATURE-----/)?.[0];
  return end > 0 && signature ? { signed: text.slice(bodyStart, end), signature } : null;
};

/** Checks a signed (not encrypted) mail against the sender's known keys. */
export const checkSigned = async (
  raw: string,
  contentType: string,
  senderKeys: string[],
): Promise<Signature> => {
  const parts = signedParts(raw, contentType);
  if (!parts) return { state: "none" };
  const { createMessage, readKey, readSignature, verify } = await openpgp();
  const { signatures } = await verify({
    message: await createMessage({ binary: new TextEncoder().encode(parts.signed) }),
    signature: await readSignature({ armoredSignature: parts.signature }),
    verificationKeys: await Promise.all(senderKeys.map((armoredKey) => readKey({ armoredKey }))),
  });
  return check(signatures, senderKeys);
};

/**
 * A mail encrypted to all recipients and oneself (so the copy in Sent stays readable), signed
 * with one's key: the raw text to send.
 */
export const encryptMail = async ({
  envelope,
  content,
  recipientKeys,
  ownKey,
  id,
}: {
  envelope: Envelope;
  content: { text: string; html: string; attachments: MimeAttachment[] };
  recipientKeys: string[];
  ownKey: PrivateKey;
  id: string;
}): Promise<string> => {
  const { createMessage, encrypt, readKey } = await openpgp();
  const encryptionKeys = [
    ...(await Promise.all(recipientKeys.map((armoredKey) => readKey({ armoredKey })))),
    ownKey.toPublic(),
  ];
  const armored = await encrypt({
    message: await createMessage({ text: contentPart(content, id) }),
    encryptionKeys,
    signingKeys: ownKey,
  });
  return encryptedMail(envelope, armored as string, id);
};
