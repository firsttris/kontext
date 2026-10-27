/**
 * Profile photos: what the server takes. The app crops and scales the picture to a small square
 * JPEG (src/lib/photo.ts), so anything else is refused rather than converted here.
 */

/** A 256 px JPEG is a few dozen KB; this leaves room without letting the folder fill up. */
export const MAX_PHOTO_BYTES = 200_000;

/** Stalwart's account ids are short base-32 strings; nothing else names a file. */
export const isAccountId = (id: string): boolean => /^[a-z0-9]{1,32}$/i.test(id);

/** JPEG by its first bytes (SOI marker), not by what the upload claims. */
export const isJpeg = (bytes: Uint8Array): boolean =>
  bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

export type PhotoCheck = { ok: true } | { ok: false; error: string };

export const checkPhoto = (bytes: Uint8Array): PhotoCheck =>
  bytes.length > MAX_PHOTO_BYTES
    ? { ok: false, error: "Das Foto ist zu groß." }
    : isJpeg(bytes)
      ? { ok: true }
      : { ok: false, error: "Nur JPEG-Fotos." };
