/**
 * What swiping a mail to the left and to the right does, per device like the colour scheme;
 * storage may be missing or hold something stale (`readSwipeSettings` falls back).
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_SWIPES, readSwipeSettings, type SwipeSettings } from "@/lib/swipe";

const KEY = "kontext.mail.swipe";
const listeners = new Set<() => void>();

const read = (): SwipeSettings => {
  try {
    return readSwipeSettings(window.localStorage.getItem(KEY));
  } catch {
    return DEFAULT_SWIPES;
  }
};

// Kept here, so every row reads the same object and a choice lasts where storage is refused.
let current: SwipeSettings = typeof window === "undefined" ? DEFAULT_SWIPES : read();

export const setSwipeSettings = (settings: SwipeSettings) => {
  current = settings;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private windows may refuse storage; the choice then lasts until the page is reloaded.
  }
  for (const listener of listeners) listener();
};

export const useSwipeSettings = (): SwipeSettings =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => DEFAULT_SWIPES,
  );
