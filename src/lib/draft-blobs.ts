/**
 * The blobs of a saved draft's files and pictures. A draft opened again refers to the parts of
 * the stored draft; saving replaces that draft, and with it go its parts, so the next save (or
 * the send) would name blobs that are gone ("blobNotFound"). After each save the files and
 * pictures therefore take the parts of the draft just written: pictures by their Content-ID,
 * files in the order they were sent. Pure.
 */
import type { BodyPart } from "@/jmap/types";

type Sent = { blobId: string; cid?: string };

/** Old blobId → new blobId, for what the saved draft holds again. */
export const savedBlobs = (
  sentFiles: Sent[],
  sentImages: (Sent & { cid: string })[],
  parts: BodyPart[],
): Map<string, string> => {
  const map = new Map<string, string>();
  const bare = (cid: string | null) => (cid ?? "").replace(/^<|>$/g, "");
  for (const image of sentImages) {
    const part = parts.find((candidate) => candidate.blobId && bare(candidate.cid) === image.cid);
    if (part?.blobId) map.set(image.blobId, part.blobId);
  }
  const files = parts.filter((part) => part.blobId && !part.cid);
  if (files.length === sentFiles.length) {
    for (const [index, file] of sentFiles.entries()) map.set(file.blobId, files[index]!.blobId!);
  }
  return map;
};

/** The item with its blob from the saved draft, if it has one. */
export const withSavedBlob =
  <T extends { blobId: string }>(map: Map<string, string>) =>
  (item: T): T => {
    const blobId = map.get(item.blobId);
    return blobId ? { ...item, blobId } : item;
  };
