/**
 * The app as high as what one sees. On a phone the keyboard covers the lower part of the screen.
 *
 * iPhone: the keyboard covers the page without making it shorter, and Safari scrolls the whole
 * page up to show the field: the header leaves the screen and the list slides away. So the shell
 * takes the visible height (`--app-height`) and the page stays at its top.
 *
 * Android (Chrome, Brave, Edge, Samsung): with `resizes-content` the browser shrinks the page the
 * moment the keyboard starts to rise, paints the strip below white until the keyboard is there,
 * and scrolls the page up while our height still lags behind. So the keyboard lies over the page
 * instead (VirtualKeyboard API, `overlaysContent`), and the app gets shorter by the keyboard's
 * height in one step: the dark app stays behind the rising keyboard, nothing scrolls. Browsers
 * without the API (Firefox) keep `resizes-content` from `index.html`.
 *
 * Fixed elements stick to the page, not to what one sees: a bottom sheet would sit under the
 * keyboard. They lift themselves by `--keyboard-height`.
 */
import { useEffect } from "react";

type VisibleArea = { height: number; offsetTop: number };

/** The part of the VirtualKeyboard API used here (Chromium; not yet in TypeScript's DOM types). */
type VirtualKeyboard = EventTarget & { overlaysContent: boolean; boundingRect: DOMRect };

/** How much of the page's bottom the keyboard (or anything else) hides, in pixels. */
export const hiddenBelow = (pageHeight: number, visible: VisibleArea) =>
  Math.max(0, Math.round(pageHeight - visible.offsetTop - visible.height));

/**
 * The app's height and how far fixed elements rise. `overlay` is the height of a keyboard that
 * lies over the page (VirtualKeyboard API); the visible area doesn't shrink for it.
 */
export const fitAboveKeyboard = (pageHeight: number, visible: VisibleArea, overlay: number) => ({
  appHeight: Math.max(0, visible.height - overlay),
  keyboardHeight: hiddenBelow(pageHeight, visible) + Math.round(overlay),
});

const virtualKeyboardOf = (nav: Navigator) =>
  (nav as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard;

export const useVisibleHeight = () =>
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const keyboard = virtualKeyboardOf(navigator);
    if (keyboard) keyboard.overlaysContent = true;
    const fitToView = () => {
      // Zoomed in with two fingers: the visible part is smaller, the page is not.
      if (viewport.scale > 1.01) {
        root.style.removeProperty("--app-height");
        root.style.removeProperty("--keyboard-height");
        return;
      }
      const overlay = keyboard?.boundingRect.height ?? 0;
      const fit = fitAboveKeyboard(root.clientHeight, viewport, overlay);
      root.style.setProperty("--app-height", `${fit.appHeight}px`);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      root.style.setProperty("--keyboard-height", `${fit.keyboardHeight}px`);
    };
    fitToView();
    viewport.addEventListener("resize", fitToView);
    viewport.addEventListener("scroll", fitToView);
    // An overlaid keyboard doesn't make the browser scroll to the field; once the app is shorter,
    // the field moves into view itself (a field in the middle of a long form).
    const fitAndReveal = () => {
      fitToView();
      requestAnimationFrame(() => document.activeElement?.scrollIntoView({ block: "nearest" }));
    };
    keyboard?.addEventListener("geometrychange", fitAndReveal);
    return () => {
      viewport.removeEventListener("resize", fitToView);
      viewport.removeEventListener("scroll", fitToView);
      keyboard?.removeEventListener("geometrychange", fitAndReveal);
      if (keyboard) keyboard.overlaysContent = false;
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--keyboard-height");
    };
  }, []);
