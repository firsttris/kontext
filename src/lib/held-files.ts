/**
 * Files of a mail that is to go encrypted stay in the browser until they are encrypted with it
 * (docs/encryption.md, "Anhänge verschlüsselter Mails"): they get a stand-in blobId with the prefix
 * `held:` and their bytes live in the composer, not in Stalwart's blob store. Only when the mail
 * goes unencrypted after all (or is saved as a draft) do they go up as usual. Pure, apart from
 * the upload and download passed in.
 */

const PREFIX = "held:";

/**
 * What an encrypted mail takes along, attachments and pictures together. The encrypted mail goes
 * to Stalwart as one upload, Base64 twice over (MIME, then the PGP armor) – about 1.8 times this –
 * which keeps it below Stalwart's usual upload limit of 50 MB, and the browser holds it in memory.
 */
export const HELD_LIMIT = 25 * 1024 * 1024;

type File = { blobId: string; size: number };

/** A stand-in blobId for a file kept in the browser. */
export const heldId = (random: string): string => `${PREFIX}${random}`;

/** Whether the file lives in the browser (not in Stalwart). */
export const isHeld = (blobId: string): boolean => blobId.startsWith(PREFIX);

/** Whether files of these sizes, together, may go with an encrypted mail. */
export const fitsEncrypted = (sizes: number[], limit = HELD_LIMIT): boolean =>
  sizes.reduce((sum, size) => sum + size, 0) <= limit;

/**
 * Moves files between the browser and Stalwart: each one that `wanted` picks goes through `move`
 * (an upload or a download), one after the other. Returns old blobId → new blobId, for
 * `withSavedBlob` (lib/draft-blobs.ts).
 */
const moved = async (
  files: File[],
  wanted: (file: File) => boolean,
  move: (blobId: string) => Promise<string>,
): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  for (const file of files) {
    if (wanted(file) && !map.has(file.blobId)) map.set(file.blobId, await move(file.blobId));
  }
  return map;
};

/** The held files up to Stalwart (the mail now goes unencrypted, or into a draft). */
export const releaseHeld = (files: File[], upload: (heldId: string) => Promise<string>) =>
  moved(files, (file) => isHeld(file.blobId), upload);

/** The files in Stalwart into the browser (encryption was switched on after they were added). */
export const pullIntoBrowser = (files: File[], download: (blobId: string) => Promise<string>) =>
  moved(files, (file) => !isHeld(file.blobId), download);
