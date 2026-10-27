/**
 * A set of strings kept in the browser (per device), shared by every component that reads it:
 * choices that only make the app nicer to use, like hidden calendars, and that may be lost.
 */
import { useSyncExternalStore } from "react";

export type StoredSet = {
  set: (key: string, on: boolean) => void;
  useSet: () => ReadonlySet<string>;
};

export const storedSet = (storageKey: string): StoredSet => {
  const read = (): string[] => {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  };
  let current: ReadonlySet<string> = new Set(read());
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const set = (key: string, on: boolean) => {
    const next = new Set(current);
    if (on) next.add(key);
    else next.delete(key);
    current = next;
    try {
      localStorage.setItem(storageKey, JSON.stringify([...next]));
    } catch {
      // Private windows may refuse storage; the choice then lasts until the page is reloaded.
    }
    for (const listener of listeners) listener();
  };
  return { set, useSet: () => useSyncExternalStore(subscribe, () => current) };
};
