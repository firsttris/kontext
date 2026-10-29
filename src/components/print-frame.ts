/**
 * Shows the browser's print dialog for a page of its own (a mail, the calendar) in a hidden
 * frame, so the app around it is not printed. The frame runs no scripts: printing is started
 * from here, and what is printed (a mail's text, an event's title) comes from others.
 */
const loaded = (image: HTMLImageElement) =>
  image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });

/** How long a slow picture from the internet may hold up the print dialog. */
const IMAGE_WAIT_MS = 8000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Prints `html` once its images are loaded (or after a while); the frame goes when printing is done. */
export const printPage = async (html: string, cleanup: () => void = () => {}) => {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  frame.srcdoc = html;
  const ready = new Promise<void>((resolve) =>
    frame.addEventListener("load", () => resolve(), { once: true }),
  );
  document.body.append(frame);
  await ready;
  const view = frame.contentWindow!;
  await Promise.race([
    Promise.all([...frame.contentDocument!.images].map(loaded)),
    wait(IMAGE_WAIT_MS),
  ]);
  const done = () => {
    frame.remove();
    cleanup();
  };
  // Some browsers return from print() at once and print later: removed only afterwards.
  view.addEventListener("afterprint", () => setTimeout(done, 0), { once: true });
  view.focus();
  view.print();
};
