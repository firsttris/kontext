/**
 * The apps chosen for the phone's tab bar, per device (like the colour scheme): a list of paths,
 * or null for the default. Storage may be missing or hold something stale; `tabBarModules`
 * (lib/tab-bar.ts) keeps only what is there.
 */
import { useSyncExternalStore } from "react";

const KEY = "kontext.tabbar";
const listeners = new Set<() => void>();

const read = (): string[] | null => {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : null;
  } catch {
    return null;
  }
};

// Read once and kept here, so every reader sees the same list (and a choice lasts until the
// page is reloaded where storage is refused).
let current: string[] | null = typeof window === "undefined" ? null : read();

/** Keeps the choice; null goes back to the default. */
export const setTabChoice = (tabs: readonly string[] | null) => {
  current = tabs === null ? null : [...tabs];
  try {
    if (tabs === null) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify(tabs));
  } catch {
    // Private windows may refuse storage; the choice then lasts until the page is reloaded.
  }
  for (const listener of listeners) listener();
};

export const useTabChoice = (): string[] | null =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
