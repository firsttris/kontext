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
 * without the API (Firefox, and Chromium builds that leave it out) keep `resizes-content` from
 * `index.html`; there the page itself gets shorter and the app follows by CSS (100dvh) alone, in
 * the same frame. What shows below a shrinking page in the installed app is the manifest's
 * `background_color`, so it is the dark one (vite.config.ts).
 *
 * Fixed elements stick to the page, not to what one sees: a bottom sheet would sit under the
 * keyboard. They lift themselves by `--keyboard-height`.
 */
import { useEffect } from "react";

type VisibleArea = { height: number; offsetTop: number };
type ZoomedArea = VisibleArea & { scale: number };

/** The part of the VirtualKeyboard API used here (Chromium; not yet in TypeScript's DOM types). */
type VirtualKeyboard = EventTarget & { overlaysContent: boolean; boundingRect: DOMRect };

/** How much of the page's bottom the keyboard (or anything else) hides, in pixels. */
export const hiddenBelow = (pageHeight: number, visible: VisibleArea) =>
  Math.max(0, Math.round(pageHeight - visible.offsetTop - visible.height));

/**
 * The app's height and how far fixed elements rise. `overlay` is the height of a keyboard that
 * lies over the page (VirtualKeyboard API); the visible area doesn't shrink for it. Nothing to
 * set when zoomed in with two fingers and no keyboard lies over the page: the visible part is
 * smaller then, the page is not.
 *
 * `closedHeight` is the visible height last seen without a keyboard. Under an overlaid keyboard
 * the app is that minus the keyboard, not the visible height minus the keyboard: while the
 * keyboard rises, Chrome on Android shrinks its view first and counters it a few frames later,
 * so the visible height dips by the keyboard for those frames ("transient view resize",
 * chrome/android/.../compositor/CompositorViewHolder.java). Taken from there, the app shrank
 * twice, the field shot up, and sank back once the keyboard was in.
 */
export const fitAboveKeyboard = (
  pageHeight: number,
  visible: ZoomedArea,
  overlay: number,
  closedHeight?: number,
): { appHeight?: number; keyboardHeight: number } | undefined => {
  if (visible.scale > 1.01)
    return overlay > 0
      ? { appHeight: Math.max(0, pageHeight - overlay), keyboardHeight: Math.round(overlay) }
      : undefined;
  const hidden = hiddenBelow(pageHeight, visible);
  // Nothing hidden (no keyboard, or one that made the page itself shorter): the app stays at
  // 100dvh. A height in px would lag a frame behind each resize, and the browser would scroll the
  // page up to the field in that frame.
  if (hidden === 0 && overlay === 0) return { keyboardHeight: 0 };
  if (overlay > 0) {
    const appHeight = Math.max(0, (closedHeight ?? visible.height) - overlay);
    // Fixed elements sit on the page: they rise to the app's bottom edge, the keyboard's top.
    return { appHeight, keyboardHeight: Math.max(0, Math.round(pageHeight - appHeight)) };
  }
  return { appHeight: visible.height, keyboardHeight: hidden };
};

/** Whether a field that brings up the keyboard has the focus. */
const typing = () =>
  document.activeElement?.matches(
    "input, textarea, select, [contenteditable]:not([contenteditable='false'])",
  ) ?? false;

/**
 * How long a visible height under an overlaid keyboard may differ from the one without it before
 * it counts as the window's own (split screen, a resized window): Chrome's dip lasts a few frames.
 */
const SETTLE_MS = 400;

const virtualKeyboardOf = (nav: Navigator) =>
  (nav as Navigator & { virtualKeyboard?: VirtualKeyboard }).virtualKeyboard;

export const useVisibleHeight = () =>
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const keyboard = virtualKeyboardOf(navigator);
    if (keyboard) keyboard.overlaysContent = true;
    // The visible height without a keyboard, for this width (a turned phone starts afresh).
    let closed: { width: number; height: number } | undefined;
    let appHeight: number | undefined;
    let settling: ReturnType<typeof setTimeout> | undefined;
    // Zoomed in, the visible height is smaller while the window is not: no new height then.
    const differs = () =>
      closed !== undefined &&
      closed.width === window.innerWidth &&
      viewport.scale <= 1.01 &&
      Math.abs(viewport.height - closed.height) > 1;
    // Under the keyboard a different visible height is first taken for Chrome's dip; if it lasts,
    // the window itself changed, and that height is the one without a keyboard from now on.
    const adoptIfLasting = (overlay: number) => {
      if (overlay === 0 || !differs()) {
        clearTimeout(settling);
        settling = undefined;
        return;
      }
      settling ??= setTimeout(() => {
        settling = undefined;
        if ((keyboard?.boundingRect.height ?? 0) === 0 || !differs()) return;
        closed = { width: window.innerWidth, height: viewport.height };
        // The app gets shorter only now, so a field it now covers moves into view.
        fitAndReveal();
      }, SETTLE_MS);
    };
    const fitToView = () => {
      const overlay = keyboard?.boundingRect.height ?? 0;
      adoptIfLasting(overlay);
      // Not while a field has the focus: its keyboard may be on its way, and Chrome can shrink the
      // view before it tells the keyboard's size.
      if (
        overlay === 0 &&
        !typing() &&
        viewport.scale <= 1.01 &&
        hiddenBelow(root.clientHeight, viewport) === 0
      )
        closed = { width: window.innerWidth, height: viewport.height };
      const closedHeight = closed?.width === window.innerWidth ? closed.height : undefined;
      const fit = fitAboveKeyboard(root.clientHeight, viewport, overlay, closedHeight);
      appHeight = fit?.appHeight;
      if (!fit) {
        root.style.removeProperty("--app-height");
        root.style.removeProperty("--keyboard-height");
        return;
      }
      if (fit.appHeight === undefined) root.style.removeProperty("--app-height");
      else root.style.setProperty("--app-height", `${fit.appHeight}px`);
      // Zoomed in, the page may move under the finger; otherwise it stays at its top.
      if (window.scrollY !== 0 && viewport.scale <= 1.01) window.scrollTo(0, 0);
      root.style.setProperty("--keyboard-height", `${fit.keyboardHeight}px`);
    };
    fitToView();
    viewport.addEventListener("resize", fitToView);
    viewport.addEventListener("scroll", fitToView);
    // An overlaid keyboard doesn't make the browser scroll to the field; once the app is shorter,
    // a field it now covers (one in the middle of a long form) moves into view. Only then: in a
    // frame where Chrome's view is still short, scrolling a field that is already above the
    // keyboard would push the page up, and it would drop back right after.
    const fitAndReveal = () => {
      fitToView();
      requestAnimationFrame(() => {
        const field = document.activeElement;
        if (field && appHeight !== undefined && field.getBoundingClientRect().bottom > appHeight)
          field.scrollIntoView({ block: "nearest" });
      });
    };
    keyboard?.addEventListener("geometrychange", fitAndReveal);
    return () => {
      clearTimeout(settling);
      viewport.removeEventListener("resize", fitToView);
      viewport.removeEventListener("scroll", fitToView);
      keyboard?.removeEventListener("geometrychange", fitAndReveal);
      if (keyboard) keyboard.overlaysContent = false;
      root.style.removeProperty("--app-height");
      root.style.removeProperty("--keyboard-height");
    };
  }, []);
