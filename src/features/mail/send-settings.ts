/**
 * How long a sent mail waits for "Rückgängig", per device (like the colour scheme); storage may
 * be missing, then the default.
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_UNDO, UNDO_CHOICES, type UndoSeconds } from "@/lib/schedule";

const KEY = "kontext.mail.undo";
const listeners = new Set<() => void>();

const read = (): UndoSeconds => {
  try {
    const stored = window.localStorage.getItem(KEY);
    const value = Number(stored);
    return stored !== null && (UNDO_CHOICES as readonly number[]).includes(value)
      ? (value as UndoSeconds)
      : DEFAULT_UNDO;
  } catch {
    return DEFAULT_UNDO;
  }
};

export const setUndoSeconds = (seconds: UndoSeconds) => {
  try {
    window.localStorage.setItem(KEY, String(seconds));
  } catch {
    // not kept; the default next time
  }
  for (const listener of listeners) listener();
};

export const useUndoSeconds = (): UndoSeconds =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    read,
    () => DEFAULT_UNDO,
  );
