/** What kind of file an attachment is, for its preview card: a thumbnail or a coloured tile. */

export type AttachmentKind =
  | "image"
  | "pdf"
  | "word"
  | "sheet"
  | "slides"
  | "archive"
  | "calendar"
  | "contact"
  | "text"
  | "other";

const BY_EXTENSION: Record<string, AttachmentKind> = {
  pdf: "pdf",
  doc: "word",
  docx: "word",
  odt: "word",
  rtf: "word",
  xls: "sheet",
  xlsx: "sheet",
  ods: "sheet",
  csv: "sheet",
  ppt: "slides",
  pptx: "slides",
  odp: "slides",
  zip: "archive",
  rar: "archive",
  "7z": "archive",
  gz: "archive",
  ics: "calendar",
  vcf: "contact",
  txt: "text",
};

/** Images every browser draws; HEIC and TIFF are left out. */
const DRAWABLE = /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)$/;

export const extensionOf = (name: string | null): string =>
  name?.includes(".") ? (name.split(".").pop() ?? "").toLowerCase() : "";

export const attachmentKind = (type: string, name: string | null): AttachmentKind => {
  if (DRAWABLE.test(type.toLowerCase())) return "image";
  if (type === "application/pdf") return "pdf";
  return BY_EXTENSION[extensionOf(name)] ?? (type.startsWith("text/") ? "text" : "other");
};

/** Larger files are not fetched just for a thumbnail. */
const PREVIEW_LIMIT: Partial<Record<AttachmentKind, number>> = {
  image: 15 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
};

export const hasThumbnail = (kind: AttachmentKind, size: number): boolean =>
  size <= (PREVIEW_LIMIT[kind] ?? -1);
