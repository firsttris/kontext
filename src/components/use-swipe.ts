/**
 * Swiping a line sideways with a finger (src/lib/swipe.ts decides what counts). The line follows
 * the finger by `offset`; letting go far enough runs the direction's action. The click the browser
 * sends after a swipe is swallowed, so a swipe does not also open the line.
 */
import { type PointerEvent, useRef, useState } from "react";
import {
  actionOnRelease,
  DECIDE_PX,
  isSwipe,
  offsetFor,
  type SwipeAction,
  type SwipeSettings,
} from "@/lib/swipe";

export const useSwipe = (settings: SwipeSettings, onSwipe: (action: SwipeAction) => void) => {
  const [offset, setOffset] = useState(0);
  const start = useRef<{ x: number; y: number }>(undefined);
  const swiping = useRef(false);
  const swiped = useRef(false);
  const moved = useRef(0);
  const reset = () => {
    start.current = undefined;
    swiping.current = false;
    moved.current = 0;
    setOffset(0);
  };
  const handlers = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      swiped.current = false;
      reset();
      if (event.pointerType !== "touch" || !event.isPrimary) return;
      start.current = { x: event.clientX, y: event.clientY };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const from = start.current;
      if (!from) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (!swiping.current) {
        if (isSwipe(dx, dy)) {
          swiping.current = true;
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // The finger is already gone; the next move or the lift ends the swipe.
          }
        } else if (Math.hypot(dx, dy) >= DECIDE_PX) {
          // Up or down: the list scrolls, this is no swipe.
          start.current = undefined;
        }
        return;
      }
      moved.current = dx;
      setOffset(offsetFor(dx, settings));
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      if (swiping.current) {
        swiped.current = true;
        const action = actionOnRelease(
          offsetFor(moved.current, settings),
          event.currentTarget.getBoundingClientRect().width,
          settings,
        );
        if (action !== "none") onSwipe(action);
      }
      reset();
    },
    onPointerCancel: reset,
  };
  return {
    /** For the line that moves. */
    handlers,
    /** How far the line is pulled sideways, in pixels; negative to the left. */
    offset,
    /** True once for the click that ends a swipe. */
    consumeClick: () => {
      const was = swiped.current;
      swiped.current = false;
      return was;
    },
  };
};
