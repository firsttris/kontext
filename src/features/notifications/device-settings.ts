/**
 * Per-device state of the notifications, kept in the browser: when the bell was last opened, the
 * invitations seen then, whether this device shows system notifications, and how often the offers
 * to install Kontext and to switch them on were postponed. Storage can be
 * missing (private window, blocked site data); everything then falls back to defaults.
 */
import { useEffect, useSyncExternalStore } from "react";
import { pushRegistration, subscribeToPush, unsubscribeFromPush } from "@/pwa/push";
import { type OfferKind, type Postponed, parsePostponed } from "./offer";

const SEEN = "kontext.notifications.seen";
const DEVICE = "kontext.notifications.device";
const POSTPONED = (kind: OfferKind) => `kontext.notifications.offer.${kind}`;

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

/** When the bell was last opened, with the invitations and tasks given to me shown then. */
export type Seen = { at: number; invitations: string[]; tasks: string[] };

const parseSeen = (raw: string | null): Seen => {
  try {
    const value = JSON.parse(raw ?? "") as Partial<Seen>;
    return {
      at: Number(value.at) || 0,
      invitations: value.invitations ?? [],
      tasks: value.tasks ?? [],
    };
  } catch {
    return { at: 0, invitations: [], tasks: [] };
  }
};

/** The raw string is the snapshot, so React sees a change only when it really changed. */
export const useSeen = (): Seen => parseSeen(useSyncExternalStore(subscribe, () => read(SEEN)));

export const markSeen = (at: number, invitations: string[], tasks: string[]) =>
  write(SEEN, JSON.stringify({ at, invitations, tasks }));

/** Opening the tasks app has shown these tasks given to me: no badge on "Aufgaben" for them. */
export const markTasksSeen = (tasks: string[]) => {
  const seen = parseSeen(read(SEEN));
  if (tasks.every((id) => seen.tasks.includes(id))) return;
  write(SEEN, JSON.stringify({ ...seen, tasks: [...new Set([...seen.tasks, ...tasks])] }));
};

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

/** Set on this device at least once, on or off (also off when the browser refused). */
export const useDeviceChosen = (): boolean =>
  useSyncExternalStore(subscribe, () => read(DEVICE) !== null);

export const usePostponed = (): Record<OfferKind, Postponed> => ({
  install: parsePostponed(useSyncExternalStore(subscribe, () => read(POSTPONED("install")))),
  push: parsePostponed(useSyncExternalStore(subscribe, () => read(POSTPONED("push")))),
});

export const postponeOffer = (kind: OfferKind, { times }: Postponed, now: number) =>
  write(POSTPONED(kind), JSON.stringify({ times: times + 1, at: now }));

/**
 * Switching on asks the browser; with permission already given it answers at once, without a
 * prompt. False if it was refused.
 */
export const setDeviceNotifications = async (on: boolean): Promise<boolean> => {
  if (!on) {
    write(DEVICE, "off");
    void keepPushSubscription();
    return true;
  }
  if (!notificationsSupported()) return false;
  const granted = (await Notification.requestPermission()) === "granted";
  write(DEVICE, granted ? "on" : "off");
  if (granted) void keepPushSubscription();
  return granted;
};

/**
 * With notifications on, this browser's push subscription is registered for the current
 * sign-in (also after signing in anew); without, it is removed. Nothing happens without a
 * service worker (development) or Web Push (older browsers).
 */
export const keepPushSubscription = async (): Promise<void> => {
  const registration = await pushRegistration();
  if (!registration || !notificationsSupported()) return;
  const on = read(DEVICE) === "on" && Notification.permission === "granted";
  await (on ? subscribeToPush(registration) : unsubscribeFromPush(registration)).catch(
    () => undefined,
  );
};
