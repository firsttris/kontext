/**
 * OpenPGP keys as Kontext keeps them: reading an armored key (which addresses, which
 * fingerprint, public or encrypted secret), and the WKD hash of an address (draft-koch-openpgp-
 * webkey-service: z-base-32 of SHA-1 of the lower-case local part). For the server; the app
 * groups fingerprints with src/lib/fingerprint.ts, which needs no OpenPGP.js.
 */
import { readKey, readPrivateKey } from "openpgp";

export type KeyInfo = { fingerprint: string; emails: string[]; created: string };

const emailsOf = (userIds: string[]) =>
  userIds
    .map((id) => (id.match(/<([^>]+)>/)?.[1] ?? id).trim().toLowerCase())
    .filter((email) => email.includes("@"));

/** A public key's facts, or null if it is none (or a secret one). */
export const publicKeyInfo = async (armored: string): Promise<KeyInfo | null> => {
  try {
    const key = await readKey({ armoredKey: armored });
    if (key.isPrivate()) return null;
    return {
      fingerprint: key.getFingerprint().toUpperCase(),
      emails: emailsOf(key.getUserIDs()),
      created: key.getCreationTime().toISOString(),
    };
  } catch {
    return null;
  }
};

/** Whether this is a secret key still locked with a passphrase, and its fingerprint. */
export const lockedPrivateKey = async (armored: string): Promise<string | null> => {
  try {
    const key = await readPrivateKey({ armoredKey: armored });
    return key.isDecrypted() ? null : key.getFingerprint().toUpperCase();
  } catch {
    return null;
  }
};

const ZBASE32 = "ybndrfg8ejkmcpqxot1uwisza345h769";

export const zbase32 = (bytes: Uint8Array): string => {
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    out += ZBASE32[Number.parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  return out;
};

/** The WKD name of an address's local part. */
export const wkdHash = async (local: string): Promise<string> =>
  zbase32(
    new Uint8Array(
      await crypto.subtle.digest("SHA-1", new TextEncoder().encode(local.toLowerCase())),
    ),
  );
