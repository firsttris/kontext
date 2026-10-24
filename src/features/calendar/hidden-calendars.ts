/**
 * Which calendars the user has hidden, per device in the browser. Stalwart 0.16.27 only lets a
 * user change the per-user `isVisible` of a colleague's calendar with write access, so the app
 * keeps this choice itself, the same way for every calendar.
 */
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "kontext.hiddenCalendars";

const read = (): string[] => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

let hidden = new Set(read());
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const setCalendarHidden = (key: string, hide: boolean): void => {
  const next = new Set(hidden);
  if (hide) next.add(key);
  else next.delete(key);
  hidden = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
  } catch {
    // Private windows may refuse storage; the choice then lasts until the page is reloaded.
  }
  for (const listener of listeners) listener();
};

/** The keys (`accountId:calendarId`) of the hidden calendars. */
export const useHiddenCalendars = (): ReadonlySet<string> =>
  useSyncExternalStore(subscribe, () => hidden);
