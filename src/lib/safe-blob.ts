/**
 * Blobs from mails take the type their sender gave. A blob: URL belongs to Kontext's own origin,
 * so one typed text/html or image/svg+xml that is opened in a tab ("Open image in new tab", a
 * middle click on a download link) runs as a page of Kontext, with the session cookie. So every
 * blob that gets a URL is retyped here: what the browser only shows (PDF, raster images) keeps its
 * type, everything else becomes a plain download.
 */
import { bytesToBase64 } from "./secure";

const RASTER = /^image\/(png|jpe?g|gif|webp|avif|bmp)$/;
const DOWNLOAD = "application/octet-stream";

const baseType = (type: string) => (type.split(";")[0] ?? "").trim().toLowerCase();

/** The type to show a file with in a tab of its own, or null when it may only be downloaded. */
export const viewableType = (type: string): string | null => {
  const base = baseType(type);
  return base === "application/pdf" || RASTER.test(base) ? base : null;
};

/** The blob to open in a tab, or null when it must be downloaded instead. */
export const asViewable = (blob: Blob): Blob | null => {
  const type = viewableType(blob.type);
  return type ? new Blob([blob], { type }) : null;
};

/** A blob for a download link: never rendered, whatever it holds. */
export const asDownload = (data: BlobPart): Blob => new Blob([data], { type: DOWNLOAD });

/**
 * A file that keeps its type where the browser only shows it (a photo in the chat, a PDF, as an
 * attachment opens in a tab) and is a plain download otherwise.
 */
export const asFile = (data: BlobPart, type: string): Blob =>
  new Blob([data], { type: viewableType(type) ?? DOWNLOAD });

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

/** How raster images begin, for parts that do not say what they are (octet-stream, x-png …). */
const SIGNATURES: [type: string, matches: (bytes: Uint8Array) => boolean][] = [
  ["image/png", (b) => b[0] === 0x89 && ascii(b, 1, 4) === "PNG"],
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/gif", (b) => ascii(b, 0, 4) === "GIF8"],
  ["image/webp", (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP"],
  ["image/avif", (b) => ascii(b, 4, 12) === "ftypavif"],
  ["image/bmp", (b) => ascii(b, 0, 2) === "BM"],
];

/** The raster type a file's first bytes show, or null. */
export const sniffRaster = (bytes: Uint8Array): string | null =>
  SIGNATURES.find(([, matches]) => matches(bytes))?.[0] ?? null;

/**
 * A URL for an <img>: a blob: URL for raster images – also for one whose part names no image type,
 * as mailers send them (an <img> always drew those); SVG as a data: URL, whose document has an
 * opaque origin and which browsers do not open as a page; null for anything else.
 */
export const imageUrl = async (blob: Blob): Promise<string | null> => {
  const base = baseType(blob.type);
  if (base === "image/svg+xml") {
    return `data:image/svg+xml;base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
  }
  const type = RASTER.test(base)
    ? base
    : sniffRaster(new Uint8Array(await blob.slice(0, 16).arrayBuffer()));
  return type ? URL.createObjectURL(new Blob([blob], { type })) : null;
};

/** Gives back what `imageUrl` took; data: URLs hold nothing. */
export const releaseImageUrl = (url: string): void => {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
};
