/**
 * The place in a list of messages: at the bottom while one is there, also when the list gets
 * shorter (the keyboard opens) or comes back after being hidden (a thread over the conversation
 * on a phone, which takes away its scroll position); elsewhere where one left it.
 */
import { type UIEvent, useEffect, useRef } from "react";

const NEAR_BOTTOM = 80;

export const useScrollPlace = () => {
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const top = useRef(0);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (element.clientHeight === 0) return; // hidden
      element.scrollTop = atBottom.current ? element.scrollHeight : top.current;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget;
    if (element.clientHeight === 0) return;
    top.current = element.scrollTop;
    atBottom.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM;
  };

  return { scroller, atBottom, onScroll };
};
