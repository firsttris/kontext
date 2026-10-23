/**
 * Moving and resizing appointments in the time grid with the mouse, in 15-minute steps. The day
 * under the pointer is found by its `data-day` column. Touch keeps scrolling the grid; on a phone
 * the dialog changes the time.
 */
import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type CalendarEvent,
  eventKey,
  eventTimes,
  fromLocal,
  minutesInDay,
  timeLabel,
} from "@/lib/jscalendar";

const STEP = 15;
const THRESHOLD = 4;

const snap = (minutes: number): number => Math.round(minutes / STEP) * STEP;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export type DragPreview = {
  id: string;
  day: string;
  /** Minutes since midnight. */
  top: number;
  height: number;
};

type Drag = {
  event: CalendarEvent;
  mode: "move" | "resize";
  x: number;
  y: number;
  /** Where in the block the pointer grabbed it, in minutes from its top. */
  grab: number;
  length: number;
  started: boolean;
};

export type Moved = { event: CalendarEvent; start: Date; end: Date; resized: boolean };

const dayAt = (x: number, y: number): HTMLElement | undefined =>
  document
    .elementsFromPoint(x, y)
    .find((el): el is HTMLElement => el instanceof HTMLElement && Boolean(el.dataset.day));

export const useDragEvents = (hourHeight: number, onMove: (moved: Moved) => void) => {
  const drag = useRef<Drag | null>(null);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  /** Set after a drag so the click that ends it does not open the event. */
  const suppressClick = useRef(false);
  const latest = useRef<DragPreview | null>(null);
  const move = useRef(onMove);
  move.current = onMove;

  useEffect(() => {
    const position = (x: number, y: number): DragPreview | null => {
      const state = drag.current!;
      const column = dayAt(x, y);
      if (!column) return latest.current;
      const pointer = ((y - column.getBoundingClientRect().top) / hourHeight) * 60;
      const day = column.dataset.day!;
      if (state.mode === "resize") {
        const top = latest.current?.top ?? 0;
        return {
          id: eventKey(state.event),
          day: latest.current?.day ?? day,
          top,
          height: clamp(snap(pointer) - top, STEP, 1440 - top),
        };
      }
      const top = clamp(snap(pointer - state.grab), 0, 1440 - STEP);
      return { id: eventKey(state.event), day, top, height: state.length };
    };

    const onPointerMove = (e: PointerEvent) => {
      const state = drag.current;
      if (!state) return;
      if (!state.started) {
        if (Math.hypot(e.clientX - state.x, e.clientY - state.y) < THRESHOLD) return;
        state.started = true;
      }
      latest.current = position(e.clientX, e.clientY);
      setPreview(latest.current);
    };

    const onPointerUp = () => {
      const state = drag.current;
      const result = latest.current;
      drag.current = null;
      latest.current = null;
      setPreview(null);
      if (!state?.started || !result) return;
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      });
      const start = fromLocal(`${result.day}T${timeLabel(result.top)}:00`);
      const end = new Date(start.getTime() + result.height * 60_000);
      const before = eventTimes(state.event);
      if (start.getTime() === before.start.getTime() && end.getTime() === before.end.getTime())
        return;
      move.current({ event: state.event, start, end, resized: state.mode === "resize" });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [hourHeight]);

  /** Props for the block of an event that may be moved. */
  const handlers = (event: CalendarEvent, day: string) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch" || e.button !== 0) return;
      const { start, end } = eventTimes(event);
      const top = minutesInDay(start, day);
      const length = Math.max(STEP, Math.round((end.getTime() - start.getTime()) / 60_000));
      const mode = (e.target as HTMLElement).closest("[data-resize]") ? "resize" : "move";
      const rect = e.currentTarget.getBoundingClientRect();
      drag.current = {
        event,
        mode,
        x: e.clientX,
        y: e.clientY,
        grab: ((e.clientY - rect.top) / hourHeight) * 60,
        length,
        started: false,
      };
      latest.current = { id: eventKey(event), day, top, height: length };
      // No text selection or native link dragging while moving.
      e.preventDefault();
    },
    onClickCapture: (e: ReactMouseEvent) => {
      if (suppressClick.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  });

  return { preview, handlers };
};
