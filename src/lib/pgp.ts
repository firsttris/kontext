/**
 * One's own OpenPGP key and others' (docs/encryption.md, building block 2): making and locking
 * it – once with the passphrase, once with a recovery code –, unlocking it, and Autocrypt, the
 * header that carries the public key with every mail. OpenPGP.js is loaded only when needed.
 */
import type { PrivateKey } from "openpgp";

const openpgp = () => import("openpgp");

/** Letters people read without mixing them up (no 0/O, 1/I/L). */
const CODE_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** "K7QP-2MXR-…": six groups of four, about 118 bits, to print and keep. */
export const recoveryCode = (random = (n: number) => crypto.getRandomValues(new Uint8Array(n))) => {
  const bytes = random(24);
  const letters = [...bytes].map((byte) => CODE_LETTERS[byte % CODE_LETTERS.length]).join("");
  return letters.match(/.{4}/g)!.join("-");
};

/** Typed in again: case and dashes do not matter. */
export const normalizeCode = (code: string) =>
  code
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .match(/.{1,4}/g)
    ?.join("-") ?? "";

export type LockedKey = {
  publicKey: string;
  privateKey: string;
  recoveryKey: string;
  recoveryCode: string;
};

const lockTwice = async (key: PrivateKey, passphrase: string): Promise<LockedKey> => {
  const { encryptKey } = await openpgp();
  const code = recoveryCode();
  const [byPassphrase, byCode] = await Promise.all([
    encryptKey({ privateKey: key, passphrase }),
    encryptKey({ privateKey: key, passphrase: normalizeCode(code) }),
  ]);
  return {
    publicKey: key.toPublic().armor(),
    privateKey: byPassphrase.armor(),
    recoveryKey: byCode.armor(),
    recoveryCode: code,
  };
};

/** A new key (Curve25519, readable by GnuPG and Thunderbird), locked twice. */
export const createOwnKey = async (name: string, email: string, passphrase: string) => {
  const { generateKey } = await openpgp();
  const { privateKey } = await generateKey({
    type: "ecc",
    curve: "curve25519Legacy",
    userIDs: [{ name, email }],
    format: "object",
  });
  return lockTwice(privateKey, passphrase);
};

/** A key one brings along (e.g. from Thunderbird), unlocked with its passphrase, locked anew. */
export const importOwnKey = async (armored: string, oldPassphrase: string, passphrase: string) => {
  const { readPrivateKey, decryptKey } = await openpgp();
  const key = await readPrivateKey({ armoredKey: armored });
  const open = key.isDecrypted()
    ? key
    : await decryptKey({ privateKey: key, passphrase: oldPassphrase });
  return lockTwice(open, passphrase);
};

/** The key unlocked for this tab; throws on a wrong passphrase. */
export const unlockKey = async (armored: string, passphrase: string): Promise<PrivateKey> => {
  const { readPrivateKey, decryptKey } = await openpgp();
  return decryptKey({
    privateKey: await readPrivateKey({ armoredKey: armored }),
    passphrase,
  });
};

/** A new passphrase (after the old one, or the recovery code); the recovery copy stays. */
export const relock = async (open: PrivateKey, passphrase: string) => {
  const { encryptKey } = await openpgp();
  return (await encryptKey({ privateKey: open, passphrase })).armor();
};

/** The addresses and fingerprint of a public key, or null. */
export const describeKey = async (armored: string) => {
  const { readKey } = await openpgp();
  try {
    const key = await readKey({ armoredKey: armored });
    return {
      fingerprint: key.getFingerprint().toUpperCase(),
      userIds: key.getUserIDs(),
      isPrivate: key.isPrivate(),
    };
  } catch {
    return null;
  }
};

const base64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

/** The Autocrypt header's value for one's own key (autocrypt.org, Level 1). */
export const autocryptHeader = async (email: string, publicKey: string) => {
  const { readKey } = await openpgp();
  const key = await readKey({ armoredKey: publicKey });
  return `addr=${email}; prefer-encrypt=mutual; keydata=${base64(key.write())}`;
};

/** An Autocrypt header read: its address and the key as armored text, or null. */
export const readAutocrypt = async (
  header: string | null | undefined,
): Promise<{ addr: string; publicKey: string } | null> => {
  if (!header) return null;
  const parts = Object.fromEntries(
    header
      .replace(/\s+/g, " ")
      .split(";")
      .map((part) => {
        const at = part.indexOf("=");
        return [part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim()];
      }),
  );
  if (!parts.addr || !parts.keydata) return null;
  try {
    const { readKey } = await openpgp();
    const binary = Uint8Array.from(atob(parts.keydata.replace(/\s/g, "")), (c) => c.charCodeAt(0));
    const key = await readKey({ binaryKey: binary });
    return { addr: parts.addr.toLowerCase(), publicKey: key.armor() };
  } catch {
    return null;
  }
};

export { groupFingerprint } from "../../server/pgp/keys";
