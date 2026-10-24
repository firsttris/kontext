/**
 * Whether the mail lists show one line per conversation (like Gmail) or every mail on its own, as
 * it came in (the default). Per device, like the colour scheme; storage may be missing.
 */
import { useSyncExternalStore } from "react";

const KEY = "kontext.mail.threads";
const listeners = new Set<() => void>();

const read = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
};

export const setThreadView = (on: boolean) => {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // not kept; one line per mail again next time
  }
  for (const listener of listeners) listener();
};

export const useThreadView = (): boolean =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => false,
  );
