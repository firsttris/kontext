/**
 * Fits the iframe of a mail to its content: as high as the mail, and a mail laid out wider than
 * the frame (a newsletter of 600 px on a phone) scaled down to its width, as Gmail and Apple Mail
 * do. Without that the frame would cut it off on the right.
 */
import { type RefObject, useEffect, useRef, useState } from "react";

/** Room below the content, so the last line's descenders are not cut. */
const SPARE = 8;

/** How far a content `contentWidth` wide has to shrink to fit `frameWidth`; 1 when it fits. */
export const fitScale = (contentWidth: number, frameWidth: number): number =>
  frameWidth > 0 && contentWidth > frameWidth ? frameWidth / contentWidth : 1;

/**
 * Scales the document's body to the frame's width and returns the height it then takes. Measured
 * unscaled each time, so a frame grown wider (a phone turned) scales less again. `zoom` shrinks
 * the layout, not only the picture, so the document's height follows; the scaled height is read
 * from the box, as `scrollHeight` stays in the body's own, unzoomed pixels.
 */
const fitBody = (document: Document): number => {
  const { body, documentElement } = document;
  body.style.zoom = "";
  const scale = fitScale(documentElement.scrollWidth, documentElement.clientWidth);
  if (scale === 1) return body.scrollHeight + SPARE;
  body.style.zoom = String(scale);
  return Math.ceil(body.getBoundingClientRect().height) + SPARE;
};

/**
 * The frame's ref and height. Fitted on load, and again whenever the body changes size: images
 * that load, a frame that gets wider or narrower.
 */
export const useFittedFrame = (
  initialHeight: number,
): [RefObject<HTMLIFrameElement | null>, number] => {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(initialHeight);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let observer: ResizeObserver | undefined;
    const fit = () => {
      const document = element.contentDocument;
      if (!document?.body) return;
      setHeight(fitBody(document));
      observer?.disconnect();
      // Measured in the next frame, so setting the height does not loop within one frame.
      observer = new ResizeObserver(() =>
        requestAnimationFrame(() => setHeight(fitBody(document))),
      );
      observer.observe(document.body);
    };
    element.addEventListener("load", fit);
    return () => {
      element.removeEventListener("load", fit);
      observer?.disconnect();
    };
  }, []);

  return [frame, height];
};
