/** Saving generated files in the browser. */

/** Hands the text to the browser as a file to save. */
export const downloadText = (text: string, filename: string, type: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
