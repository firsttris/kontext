/**
 * The app as high as what one sees. On a phone the keyboard covers the lower part of the screen.
 *
 * iPhone: the keyboard covers the page without making it shorter, and Safari scrolls the whole
 * page up to show the field: the header leaves the screen and the list slides away. So the shell
 * takes the visible height (`--app-height`) and the page stays at its top.
 *
 * Android (Chrome, Brave, Edge, Samsung, Firefox): `interactive-widget=resizes-content` in
 * `index.html` makes the page itself shorter by the keyboard, and the app follows by CSS (100dvh)
 * alone, in the same frame, with nothing set here. An earlier way laid the keyboard over the page
 * (VirtualKeyboard API) and shortened the app by its height from script; Chrome reports the
 * keyboard's final height before it rises and dips its view while it does, so the field jumped up
 * ahead of the keyboard and back down, however the heights were held. What shows below a page
 * the keyboard is shrinking is the app's dark background (`html`, and the manifest's
 * `background_color` in the installed app, vite.config.ts), not a white strip.
 *
 * Fixed elements stick to the page, not to what one sees: on iOS a bottom sheet would sit under
 * the keyboard. They lift themselves by `--keyboard-height`.
 */
import { useEffect } from "react";

type VisibleArea = { height: number; offsetTop: number };
type ZoomedArea = VisibleArea & { scale: number };

/** How much of the page's bottom the keyboard (or anything else) hides, in pixels. */
export const hiddenBelow = (pageHeight: number, visible: VisibleArea) =>
  Math.max(0, Math.round(pageHeight - visible.offsetTop - visible.height));

/**
 * The app's height and how far fixed elements rise. Nothing to set when zoomed in with two
 * fingers: the visible part is smaller then, the page is not.
 */
export const fitAboveKeyboard = (
  pageHeight: number,
  visible: ZoomedArea,
): { appHeight?: number; keyboardHeight: number } | undefined => {
  if (visible.scale > 1.01) return undefined;
  const hidden = hiddenBelow(pageHeight, visible);
  // Nothing hidden (no keyboard, or one that made the page itself shorter): the app stays at
  // 100dvh. A height in px would lag a frame behind each resize, and the browser would scroll the
  // page up to the field in that frame.
  if (hidden === 0) return { keyboardHeight: 0 };
  return { appHeight: visible.height, keyboardHeight: hidden };
};

export const useVisibleHeight = () =>
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const fitToView = () => {
      const fit = fitAboveKeyboard(root.clientHeight, viewport);
      if (!fit) {
        root.style.removeProperty("--app-height");
        root.style.removeProperty("--keyboard-height");
        return;
      }
      if (fit.appHeight === undefined) root.style.removeProperty("--app-height");
      else {
        root.style.setProperty("--app-height", `${fit.appHeight}px`);
        // Safari scrolled the page up to the field; the app now fits, so it goes back to its top.
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      }
      root.style.setProperty("--keyboard-height", `${fit.keyboardHeight}px`);
    };
    fitToView();
    viewport.addEventListener("resize", fitToView);
    viewport.addEventListener("scroll", fitToView);
    return () => {
      viewport.removeEventListener("resize", fitToView);
      viewport.removeEventListener("scroll", fitToView);
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--keyboard-height");
    };
  }, []);
