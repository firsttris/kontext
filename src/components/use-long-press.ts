/**
 * A long press with a finger, as phones use it to start picking. The click the browser sends
 * after lifting the finger is swallowed, so the press does not also open what was pressed.
 */
import { type MouseEvent, type PointerEvent, useRef } from "react";

const HOLD_MS = 450;
/** A finger that moves this far scrolls the list rather than presses. */
const SLOP_PX = 10;

export const useLongPress = (onLongPress: () => void) => {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const start = useRef<{ x: number; y: number }>(undefined);
  const fired = useRef(false);
  const cancel = () => {
    clearTimeout(timer.current);
    start.current = undefined;
  };
  const handlers = {
    onPointerDown: (event: PointerEvent) => {
      fired.current = false;
      // A second finger is a pinch or a zoom, not a press: it ends the first one's too.
      cancel();
      if (event.pointerType !== "touch" || !event.isPrimary) return;
      start.current = { x: event.clientX, y: event.clientY };
      timer.current = setTimeout(() => {
        fired.current = true;
        start.current = undefined;
        onLongPress();
      }, HOLD_MS);
    },
    onPointerMove: (event: PointerEvent) => {
      const from = start.current;
      if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > SLOP_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    /** The press's own menu (copy the link, open in a tab) stays away. */
    onContextMenu: (event: MouseEvent) => {
      if (fired.current || start.current) event.preventDefault();
    },
  };
  return {
    /** For the pressed element. */
    handlers,
    /** True once for the click that ends a long press: it was the press, not a tap. */
    consumeClick: () => {
      const was = fired.current;
      fired.current = false;
      return was;
    },
  };
};
