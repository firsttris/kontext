/**
 * The order of the mail lists (src/lib/mail-sort.ts): one choice for every folder, per device like
 * the conversation view, so a folder opens the way one last chose; storage may be missing.
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_SORT, type MailSort, readMailSort } from "@/lib/mail-sort";

const KEY = "kontext.mail.sort";
const listeners = new Set<() => void>();

const read = (): MailSort => {
  try {
    return readMailSort(window.localStorage.getItem(KEY));
  } catch {
    return DEFAULT_SORT;
  }
};

// Kept here, so the choice lasts until a reload where storage is refused.
let current: MailSort = typeof window === "undefined" ? DEFAULT_SORT : read();

export const setMailSort = (sort: MailSort) => {
  current = sort;
  try {
    window.localStorage.setItem(KEY, sort);
  } catch {
    // Private windows may refuse storage; the choice then lasts until the page is reloaded.
  }
  for (const listener of listeners) listener();
};

export const useMailSort = (): MailSort =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => DEFAULT_SORT,
  );
