/**
 * The app as high as what one sees. On a phone the keyboard covers the lower part of the screen
 * without making the page shorter (iOS; Android only with `interactive-widget`), and the browser
 * scrolls the whole page up to show the field: the header leaves the screen and the list slides
 * away. So the shell takes the visible height (`--app-height`) and the page stays at its top.
 * Fixed elements stick to the page, not to what one sees: a bottom sheet would sit under the
 * keyboard. They lift themselves by `--keyboard-height`.
 */
import { useEffect } from "react";

type VisibleArea = { height: number; offsetTop: number };

/** How much of the page's bottom the keyboard (or anything else) hides, in pixels. */
export const hiddenBelow = (pageHeight: number, visible: VisibleArea) =>
  Math.max(0, Math.round(pageHeight - visible.offsetTop - visible.height));

export const useVisibleHeight = () =>
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const fitToView = () => {
      // Zoomed in with two fingers: the visible part is smaller, the page is not.
      if (viewport.scale > 1.01) {
        root.style.removeProperty("--app-height");
        root.style.removeProperty("--keyboard-height");
        return;
      }
      root.style.setProperty("--app-height", `${viewport.height}px`);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      root.style.setProperty("--keyboard-height", `${hiddenBelow(root.clientHeight, viewport)}px`);
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
