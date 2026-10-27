/**
 * The app as high as what one sees. On a phone the keyboard covers the lower part of the screen
 * without making the page shorter (iOS; Android only with `interactive-widget`), and the browser
 * scrolls the whole page up to show the field: the header leaves the screen and the list slides
 * away. So the shell takes the visible height (`--app-height`) and the page stays at its top.
 */
import { useEffect } from "react";

export const useVisibleHeight = () =>
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const root = document.documentElement;
    const fitToView = () => {
      // Zoomed in with two fingers: the visible part is smaller, the page is not.
      if (viewport.scale > 1.01) root.style.removeProperty("--app-height");
      else root.style.setProperty("--app-height", `${viewport.height}px`);
      if (window.scrollY !== 0 && viewport.scale <= 1.01) window.scrollTo(0, 0);
    };
    fitToView();
    viewport.addEventListener("resize", fitToView);
    viewport.addEventListener("scroll", fitToView);
    return () => {
      viewport.removeEventListener("resize", fitToView);
      viewport.removeEventListener("scroll", fitToView);
      root.style.removeProperty("--app-height");
    };
  }, []);
