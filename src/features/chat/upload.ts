/**
 * Sending photos and files to the chat. A phone photo (often 4–8 MB) is made smaller first, so it
 * arrives quickly on mobile data and does not fill the server, and gets a small picture along
 * (a few dozen KB) that the conversation shows; other files go as they are.
 */
import {
  type ChatFile,
  fitWithin,
  isPhoto,
  MAX_FILE_BYTES,
  PHOTO_SIDE,
  THUMB_SIDE,
} from "@/lib/chat-cards";
import { m } from "@/paraglide/messages";

/** JPEG and PNG photos larger than this on a side are scaled down; GIFs keep their animation. */
const shrinkable = (file: File) => file.type === "image/jpeg" || file.type === "image/png";

export const shrinkPhoto = async (file: File): Promise<File> => {
  if (!shrinkable(file) || typeof createImageBitmap === "undefined") return file;
  try {
    // "from-image" turns phone photos the right way up (EXIF orientation).
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (Math.max(bitmap.width, bitmap.height) <= PHOTO_SIDE && file.size < 1_500_000) {
      bitmap.close();
      return file;
    }
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.(png|jpe?g)$/i, "") || "Foto";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
};

/** The small picture of a photo, as JPEG; none for GIFs (they keep moving) or when it fails. */
export const thumbnailOf = async (file: File): Promise<File | null> => {
  if (!isPhoto(file.type) || file.type === "image/gif") return null;
  if (typeof createImageBitmap === "undefined") return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const size = fitWithin(bitmap.width, bitmap.height, THUMB_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.8));
    return blob ? new File([blob], "thumb.jpg", { type: "image/jpeg" }) : null;
  } catch {
    return null;
  }
};

export const uploadFile = async (
  channelId: string,
  file: File,
  { mailCopy = false }: { mailCopy?: boolean } = {},
): Promise<ChatFile> => {
  const ready = isPhoto(file.type) ? await shrinkPhoto(file) : file;
  if (ready.size > MAX_FILE_BYTES) throw new Error(m.chat_file_too_large({ name: file.name }));
  const form = new FormData();
  form.append("file", ready);
  const thumb = await thumbnailOf(ready);
  if (thumb) form.append("thumb", thumb);
  if (mailCopy) form.append("kind", "mail-copy");
  const response = await fetch(`/api/chat/channels/${encodeURIComponent(channelId)}/files`, {
    method: "POST",
    credentials: "same-origin",
    body: form,
  });
  const result = (await response.json().catch(() => ({}))) as { file?: ChatFile; error?: string };
  if (!response.ok || !result.file) throw new Error(result.error ?? String(response.status));
  return result.file;
};

export const fileUrl = (id: string) => `/api/chat/files/${encodeURIComponent(id)}`;

/** The small picture where there is one, else the photo itself (sent before they were made). */
export const thumbUrl = (file: ChatFile) =>
  file.thumb ? `${fileUrl(file.id)}?thumb=1` : fileUrl(file.id);
