/**
 * The place in a list of messages: at the bottom while one is there, also when the list gets
 * shorter (the keyboard opens), its messages grow (pictures, previews, decrypted text) or it comes
 * back after being hidden (a thread over the conversation on a phone, which takes away its scroll
 * position); elsewhere where one left it.
 *
 * Until one scrolls oneself, the list stays at the bottom: Safari on iOS sets a position given to a
 * freshly laid out list back to the top a moment later and reports that as a scroll, which would
 * otherwise read as having scrolled up.
 */
import { type UIEvent, useCallback, useEffect, useRef } from "react";

const NEAR_BOTTOM = 80;

export const useScrollPlace = () => {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const top = useRef(0);
  const touched = useRef(false);

  /** To the bottom, now and once more after the browser has laid out and painted the list. */
  const toBottom = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
    requestAnimationFrame(() => {
      if (atBottom.current) element.scrollTop = element.scrollHeight;
    });
  }, []);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    // The list itself: shorter or shown again.
    const list = new ResizeObserver(() => {
      if (element.clientHeight === 0) return; // hidden
      if (atBottom.current) toBottom();
      else element.scrollTop = top.current;
    });
    list.observe(element);
    // What is in it: a message that grows keeps one at the bottom.
    const content = new ResizeObserver(() => {
      if (element.clientHeight > 0 && atBottom.current) toBottom();
    });
    const observeChildren = () => {
      content.disconnect();
      for (const child of element.children) content.observe(child);
    };
    observeChildren();
    const children = new MutationObserver(observeChildren);
    children.observe(element, { childList: true });
    return () => {
      list.disconnect();
      content.disconnect();
      children.disconnect();
    };
  }, [toBottom]);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.clientHeight === 0) return;
    if (!touched.current && atBottom.current) {
      element.scrollTop = element.scrollHeight;
      return;
    }
    top.current = element.scrollTop;
    atBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM;
  };

  // Scrolled by the one reading: a finger, the wheel, the scroll bar or the keys.
  const byHand = () => {
    touched.current = true;
  };

  return {
    scroller,
    atBottom,
    toBottom,
    scrollProps: {
      onScroll,
      onTouchStart: byHand,
      onWheel: byHand,
      onPointerDown: byHand,
      onKeyDown: byHand,
    },
  };
};
