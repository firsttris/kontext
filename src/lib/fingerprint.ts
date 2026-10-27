/**
 * Fingerprints as people compare them. On its own, without OpenPGP.js: the settings, the chat and
 * S/MIME show fingerprints, and a static import of "openpgp" here would pull the whole library
 * into the mail view (src/lib/pgp.ts loads it only when a key is used).
 */

/** "5A3F 9C21 …": a fingerprint in groups of four. */
export const groupFingerprint = (fingerprint: string): string =>
  fingerprint.replace(/(.{4})/g, "$1 ").trim();
