/** Saving files in the browser. */
import { asDownload } from "./safe-blob";

const save = (blob: Blob, filename: string, keepMs: number) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), keepMs);
};

/** Hands the text to the browser as a file to save. */
export const downloadText = (text: string, filename: string, type: string): void =>
  save(new Blob([text], { type }), filename, 1000);

/** Hands a file to the browser to save, never to show: it may hold anything (safe-blob.ts). */
export const downloadBlob = (data: BlobPart, filename: string): void =>
  save(asDownload(data), filename, 60_000);
