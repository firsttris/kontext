/**
 * The working hours of the calendar grid (src/lib/work-hours.ts), per device like the other
 * choices that only make the app nicer to use; storage may be missing, then the default.
 */
import { useSyncExternalStore } from "react";
import {
  DEFAULT_WORK_HOURS,
  readWorkHours,
  type WorkHours,
  writeWorkHours,
} from "@/lib/work-hours";

const KEY = "kontext.calendar.workHours";
const listeners = new Set<() => void>();

const read = (): WorkHours => {
  try {
    return readWorkHours(window.localStorage.getItem(KEY));
  } catch {
    return DEFAULT_WORK_HOURS;
  }
};

// Kept here, so the choice lasts until a reload where storage is refused.
let current: WorkHours = typeof window === "undefined" ? DEFAULT_WORK_HOURS : read();

export const setWorkHours = (hours: WorkHours) => {
  current = hours;
  try {
    window.localStorage.setItem(KEY, writeWorkHours(hours));
  } catch {
    // Private windows may refuse storage; the choice then lasts until the page is reloaded.
  }
  for (const listener of listeners) listener();
};

export const useWorkHours = (): WorkHours =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => DEFAULT_WORK_HOURS,
  );
