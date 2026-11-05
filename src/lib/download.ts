/** Saving generated files in the browser. */

/** Hands the Blob to the browser as a file to save. */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Long enough for the browser to start saving a large file (FileSaver.js waits 40 s).
  setTimeout(() => URL.revokeObjectURL(url), 40_000);
};

/** Hands the text to the browser as a file to save. */
export const downloadText = (text: string, filename: string, type: string): void =>
  downloadBlob(new Blob([text], { type }), filename);
