/**
 * Time-based one-time codes (RFC 6238) for setting up two-factor sign-in. Stalwart stores the
 * otpauth URL but does not check a first code, so the app checks it before saving, so that nobody
 * locks themselves out with a mistyped secret.
 */

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const toBase32 = (bytes: Uint8Array): string => {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
};

export const fromBase32 = (text: string): Uint8Array<ArrayBuffer> => {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, "");
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of clean) {
    value = (value << 5) | BASE32.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
};

export const newSecret = (): string => toBase32(crypto.getRandomValues(new Uint8Array(20)));

export const otpauthUrl = (secret: string, account: string, issuer = "Kontext"): string =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

/** The 6-digit code of a secret at a moment (default: now). */
export const totp = async (secret: string, at: number = Date.now()): Promise<string> => {
  const counter = Math.floor(at / 30_000);
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, BigInt(counter));
  const key = await crypto.subtle.importKey(
    "raw",
    fromBase32(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const hash = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  const offset = hash[hash.length - 1]! & 15;
  const binary = new DataView(hash.buffer).getUint32(offset) & 0x7fffffff;
  return String(binary % 1_000_000).padStart(6, "0");
};

/** Accepts the code of now and of the 30 seconds before and after (clock drift). */
export const verifyTotp = async (
  secret: string,
  code: string,
  at: number = Date.now(),
): Promise<boolean> => {
  const wanted = code.replace(/\s/g, "");
  for (const shift of [0, -30_000, 30_000]) {
    if ((await totp(secret, at + shift)) === wanted) return true;
  }
  return false;
};
