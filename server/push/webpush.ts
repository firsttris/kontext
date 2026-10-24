/**
 * Web Push with nothing but WebCrypto: the VAPID signature that identifies the sender (RFC 8292)
 * and the encryption of the message for one browser (RFC 8291 with aes128gcm, RFC 8188). Only
 * the browser that subscribed can read what the push service passes on.
 */

export type VapidKeys = {
  /** The uncompressed P-256 public key, base64url – the browser's `applicationServerKey`. */
  publicKey: string;
  /** The private key as JWK. */
  privateKey: JsonWebKey;
};

/** A browser's subscription, as `PushSubscription.toJSON()` gives it. */
export type PushTarget = { endpoint: string; keys: { p256dh: string; auth: string } };

const encoder = new TextEncoder();

export const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> => {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

const concat = (...parts: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

export const generateVapidKeys = async (): Promise<VapidKeys> => {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ]);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    publicKey: toBase64Url(publicKey),
    privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
};

/**
 * `Authorization: vapid t=…, k=…` for one push service (the JWT's audience is its origin),
 * valid for 12 hours. `subject` is a mailto: or https: address the service can reach us at.
 */
export const vapidAuthorization = async (
  endpoint: string,
  keys: VapidKeys,
  subject: string,
  now = Date.now(),
): Promise<string> => {
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = toBase64Url(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: subject,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "jwk",
    keys.privateKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  // WebCrypto signs ES256 as r||s, which is what JWS wants.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      encoder.encode(`${header}.${claims}`),
    ),
  );
  return `vapid t=${header}.${claims}.${toBase64Url(signature)}, k=${keys.publicKey}`;
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

/** One record holds the whole message (push messages stay far below 4 KB). */
const RECORD_SIZE = 4096;

/**
 * The message for one browser, encrypted (RFC 8291 §3.4): a fresh key pair per message, the
 * secret agreed with the browser's key, mixed with its auth secret.
 */
export const encryptPayload = async (
  payload: Uint8Array,
  target: PushTarget["keys"],
  salt: Uint8Array<ArrayBuffer> = crypto.getRandomValues(new Uint8Array(16)),
): Promise<Uint8Array<ArrayBuffer>> => {
  const browserKey = fromBase64Url(target.p256dh);
  const authSecret = fromBase64Url(target.auth);
  const ours = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const ourPublic = new Uint8Array(await crypto.subtle.exportKey("raw", ours.publicKey));
  const theirs = await crypto.subtle.importKey(
    "raw",
    browserKey,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: theirs }, ours.privateKey, 256),
  );
  const keyInfo = concat(encoder.encode("WebPush: info\0"), browserKey, ourPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // 0x02: the last (and only) record.
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aes,
      concat(payload, new Uint8Array([2])),
    ),
  );
  const header = new Uint8Array(16 + 4 + 1 + ourPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = ourPublic.length;
  header.set(ourPublic, 21);
  return concat(header, sealed);
};

export type PushResult = { status: number };

/**
 * Sends one message to one browser. 404 and 410 from the push service mean the subscription is
 * gone (uninstalled, permission withdrawn): the caller forgets it.
 */
export const sendPush = async (
  target: PushTarget,
  message: unknown,
  keys: VapidKeys,
  subject: string,
  options: { ttl?: number; urgency?: "normal" | "high"; fetch?: typeof fetch } = {},
): Promise<PushResult> => {
  const body = await encryptPayload(encoder.encode(JSON.stringify(message)), target.keys);
  const response = await (options.fetch ?? fetch)(target.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidAuthorization(target.endpoint, keys, subject),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(options.ttl ?? 24 * 3600),
      urgency: options.urgency ?? "normal",
    },
    body,
  });
  return { status: response.status };
};
