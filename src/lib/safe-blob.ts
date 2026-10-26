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

/** A file that is shown when it is a raster image (a photo in the chat) and downloaded otherwise. */
export const asFile = (data: BlobPart, type: string): Blob => {
  const base = baseType(type);
  return new Blob([data], { type: RASTER.test(base) ? base : DOWNLOAD });
};

/**
 * A URL for an <img>: a blob: URL for raster images; SVG as a data: URL, whose document has an
 * opaque origin and which browsers do not open as a page; null for anything else.
 */
export const imageUrl = async (blob: Blob): Promise<string | null> => {
  const base = baseType(blob.type);
  if (RASTER.test(base)) return URL.createObjectURL(new Blob([blob], { type: base }));
  if (base !== "image/svg+xml") return null;
  return `data:image/svg+xml;base64,${bytesToBase64(new Uint8Array(await blob.arrayBuffer()))}`;
};

/** Gives back what `imageUrl` took; data: URLs hold nothing. */
export const releaseImageUrl = (url: string): void => {
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
};
