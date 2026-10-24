/**
 * What a browser does with a push message: decrypt it with its own key pair (RFC 8291). Kontext
 * itself never receives pushes; the tests use this to read what the server sent.
 */
import { fromBase64Url, toBase64Url } from "./webpush";

const encoder = new TextEncoder();

export type BrowserKeys = {
  /** As the browser hands them to the server. */
  p256dh: string;
  auth: string;
  privateKey: CryptoKey;
};

export const browserKeys = async (): Promise<BrowserKeys> => {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  return {
    p256dh: toBase64Url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))),
    auth: toBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    privateKey: pair.privateKey,
  };
};

const hkdf = async (
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
) => {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8),
  );
};

export const decryptPayload = async (body: Uint8Array, keys: BrowserKeys): Promise<string> => {
  const salt = body.slice(0, 16);
  const idLength = body[20]!;
  const senderPublic = body.slice(21, 21 + idLength);
  const sealed = body.slice(21 + idLength);
  const sender = await crypto.subtle.importKey(
    "raw",
    senderPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: sender }, keys.privateKey, 256),
  );
  const ownPublic = fromBase64Url(keys.p256dh);
  const info = new Uint8Array([
    ...encoder.encode("WebPush: info\0"),
    ...ownPublic,
    ...senderPublic,
  ]);
  const ikm = await hkdf(fromBase64Url(keys.auth), shared, info, 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, sealed),
  );
  // Without the padding delimiter (0x02 for the last record).
  return new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2)));
};
