/**
 * A picture the user picked, made into a photo: the centred square, scaled to PHOTO_PX and turned
 * the right way up, as JPEG. Small enough for the server (server/photos/photo.ts) and to carry
 * inside a contact card.
 */
import { PHOTO_PX, squareCrop } from "@/lib/photo";
import { m } from "@/paraglide/messages";

export const squarePhoto = async (file: File): Promise<Blob> => {
  if (!file.type.startsWith("image/")) throw new Error(m.photo_not_image());
  // "from-image" turns phone photos the right way up (EXIF orientation).
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => {
    throw new Error(m.photo_not_image());
  });
  const crop = squareCrop(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_PX;
  canvas.height = PHOTO_PX;
  canvas
    .getContext("2d")
    ?.drawImage(bitmap, crop.x, crop.y, crop.side, crop.side, 0, 0, PHOTO_PX, PHOTO_PX);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
  if (!blob) throw new Error(m.photo_not_image());
  return blob;
};

/** The photo as `data:` URI, as a contact card carries it. */
export const dataUri = (blob: Blob): Promise<string> =>
  new Promise((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(reader.result as string);
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });
