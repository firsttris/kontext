/**
 * "Vertraulich senden" in the browser (docs/encryption.md, building block 4): the content is
 * encrypted with a fresh AES-GCM key that lives only in the link after "#" (browsers never send
 * that part to a server); the code is the second key, checked by the server. The sender keeps the
 * key locked with their own OpenPGP key, to read answers later on any device.
 */
import type { PrivateKey } from "openpgp";

export type SecureFile = { name: string; type: string; data: string };
export type SecureContent = {
  subject: string;
  html: string;
  text: string;
  attachments: SecureFile[];
  sentAt: string;
};
export type SecureReply = { text: string; attachments: SecureFile[]; at: string };

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export const bytesToBase64 = toBase64;
export const base64ToBytes = fromBase64;

/** A new key, 256 bits. */
export const newSecureKey = () => crypto.getRandomValues(new Uint8Array(32));

/** The key as it stands in the link: base64url, without padding. */
export const keyToFragment = (key: Uint8Array) =>
  toBase64(key).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const fragmentToKey = (fragment: string) =>
  fromBase64(fragment.replace(/^#/, "").replace(/-/g, "+").replace(/_/g, "/"));

const aes = (key: Uint8Array) =>
  crypto.subtle.importKey("raw", key as Uint8Array<ArrayBuffer>, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);

/** Anything as JSON, encrypted: base64 of the 12-byte iv and the cipher text. */
export const seal = async (key: Uint8Array, value: unknown): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aes(key), data),
  );
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv);
  out.set(sealed, iv.length);
  return toBase64(out);
};

/** What `seal` made; throws if the key does not fit or anything was changed. */
export const unseal = async <T>(key: Uint8Array, sealed: string): Promise<T> => {
  const bytes = fromBase64(sealed);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.subarray(0, 12) },
    await aes(key),
    bytes.subarray(12),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
};

const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** "K7QP-2MXR": eight letters and digits that are not mixed up, said easily on the phone. */
export const secureCode = (random = (n: number) => crypto.getRandomValues(new Uint8Array(n))) =>
  [...random(8)]
    .map((byte) => CODE_LETTERS[byte % CODE_LETTERS.length])
    .join("")
    .replace(/^(.{4})/, "$1-");

/** The key for the sender: an OpenPGP message to their own public key. */
export const wrapForSender = async (key: Uint8Array, publicKey: string) => {
  const { createMessage, encrypt, readKey } = await import("openpgp");
  return (await encrypt({
    message: await createMessage({ binary: key }),
    encryptionKeys: await readKey({ armoredKey: publicKey }),
    format: "armored",
  })) as string;
};

export const unwrapForSender = async (wrapped: string, privateKey: PrivateKey) => {
  const { decrypt, readMessage } = await import("openpgp");
  const { data } = await decrypt({
    message: await readMessage({ armoredMessage: wrapped }),
    decryptionKeys: privateKey,
    format: "binary",
  });
  return data as Uint8Array;
};
