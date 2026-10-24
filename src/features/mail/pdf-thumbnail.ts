/**
 * The first page of a PDF as a PNG, for the attachment card. pdf.js is loaded only when a PDF is
 * shown and parses in its worker (same origin, so the CSP's 'self' allows it). Version 6 no longer
 * evaluates font code (the hole behind CVE-2024-4367 is gone); forms and scripts stay off.
 */
export const renderPdfThumbnail = async (pdf: Blob, width: number): Promise<Blob> => {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await pdf.arrayBuffer()),
    enableXfa: false,
  });
  try {
    const document = await task.promise;
    const page = await document.getPage(1);
    const viewport = page.getViewport({ scale: width / page.getViewport({ scale: 1 }).width });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("PDF preview"))),
        "image/png",
      ),
    );
  } finally {
    await task.destroy();
  }
};
