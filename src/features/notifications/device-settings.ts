/**
 * Per-device state of the notifications, kept in the browser: when the bell was last opened, the
 * invitations seen then, and whether this device shows system notifications. Storage can be
 * missing (private window, blocked site data); everything then falls back to defaults.
 */
import { useEffect, useSyncExternalStore } from "react";

const SEEN = "kontext.notifications.seen";
const DEVICE = "kontext.notifications.device";

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // not stored; the default comes back next time
  }
  for (const listener of listeners) listener();
};

const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export type Seen = { at: number; invitations: string[] };

const parseSeen = (raw: string | null): Seen => {
  try {
    const value = JSON.parse(raw ?? "") as Partial<Seen>;
    return { at: Number(value.at) || 0, invitations: value.invitations ?? [] };
  } catch {
    return { at: 0, invitations: [] };
  }
};

/** The raw string is the snapshot, so React sees a change only when it really changed. */
export const useSeen = (): Seen => parseSeen(useSyncExternalStore(subscribe, () => read(SEEN)));

export const markSeen = (at: number, invitations: string[]) =>
  write(SEEN, JSON.stringify({ at, invitations }));

export const notificationsSupported = (): boolean => typeof Notification !== "undefined";

/**
 * Switched off again when the permission is taken back in the browser's site settings. The
 * Permissions API is asked, not `Notification.permission`, which some browsers (headless
 * Chromium) report as "denied" while notifications are allowed.
 */
const followBrowserPermission = () => {
  void navigator.permissions
    ?.query({ name: "notifications" })
    .then((status) => {
      const apply = () => {
        if (status.state === "denied" && read(DEVICE) === "on") write(DEVICE, "off");
      };
      apply();
      status.addEventListener("change", apply);
    })
    .catch(() => undefined);
};

/** On if switched on here (only possible with the browser's permission, see below). */
export const useDeviceNotifications = (): boolean => {
  useEffect(followBrowserPermission, []);
  return useSyncExternalStore(subscribe, () => read(DEVICE) === "on" && notificationsSupported());
};

/**
 * Switching on asks the browser; with permission already given it answers at once, without a
 * prompt. False if it was refused.
 */
export const setDeviceNotifications = async (on: boolean): Promise<boolean> => {
  if (!on) {
    write(DEVICE, "off");
    return true;
  }
  if (!notificationsSupported()) return false;
  const granted = (await Notification.requestPermission()) === "granted";
  write(DEVICE, granted ? "on" : "off");
  return granted;
};
