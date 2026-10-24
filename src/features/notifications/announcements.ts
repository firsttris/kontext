/**
 * System notifications on this device, when switched on: a new mail while Kontext is in the
 * background, and a reminder 15 minutes before an appointment. A click brings the tab to the front
 * and opens the mail or the appointment.
 */
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { displayName } from "@/lib/format";
import { dateKey, locationName, toLocal } from "@/lib/jscalendar";
import {
  type InboxMail,
  mailsToAnnounce,
  REMINDER_MINUTES,
  reminderDelay,
} from "@/lib/notifications";
import { m } from "@/paraglide/messages";
import { useDeviceNotifications } from "./device-settings";
import type { FeedEvent } from "./feed";

/**
 * Through the service worker where there is one: installed apps on Android allow notifications
 * only that way, and a click then also reaches a closed window (src/sw/service-worker.ts).
 */
const show = (
  title: string,
  body: string,
  tag: string,
  url: string,
  open: (url: string) => void,
) => {
  const options = { body, tag, icon: "/icon-192.png", badge: "/icon-192.png", data: { url } };
  const registration = navigator.serviceWorker?.controller
    ? navigator.serviceWorker.ready
    : Promise.resolve(null);
  void registration.then((worker) => {
    if (worker) return worker.showNotification(title, options);
    const notification = new Notification(title, options);
    notification.onclick = () => {
      window.focus();
      open(url);
      notification.close();
    };
  });
};

export const useAnnouncements = (mails: InboxMail[], appointments: FeedEvent[]) => {
  const enabled = useDeviceNotifications();
  const navigate = useNavigate();
  const router = useRouter();
  const open = useCallback((href: string) => void navigate({ href }), [navigate]);
  // Only mail that arrives while the app is open is news; what was there before is in the bell.
  const since = useRef(Date.now());
  const announced = useRef(new Set<string>());

  useEffect(() => {
    if (!enabled) return;
    for (const mail of mailsToAnnounce(mails, since.current, announced.current)) {
      announced.current.add(`${mail.accountId}/${mail.email.id}`);
      // In front, the user sees it in the list; a system notification would only interrupt.
      if (document.visibilityState === "visible") continue;
      show(
        m.notifications_new_mail({ name: displayName(mail.email.from?.[0]) }),
        mail.email.subject ?? "",
        `mail-${mail.email.id}`,
        router.buildLocation({
          to: "/mail/$accountId/$mailboxId",
          params: { accountId: mail.accountId, mailboxId: "inbox" },
          search: { email: mail.email.id },
        }).href,
        open,
      );
    }
  }, [enabled, mails, open, router]);

  // One timer per appointment of the rest of today; rescheduled when the list changes.
  const reminded = useRef(new Set<string>());
  useEffect(() => {
    if (!enabled) return;
    const timers = appointments.flatMap(({ key, title, start, event }) => {
      const delay = reminderDelay(start, new Date());
      if (delay === undefined || reminded.current.has(key)) return [];
      return [
        window.setTimeout(() => {
          reminded.current.add(key);
          const place = locationName(event);
          show(
            m.notifications_reminder({ minutes: REMINDER_MINUTES, title }),
            `${toLocal(start).slice(11, 16)}${place ? ` · ${place}` : ""}`,
            `event-${key}`,
            router.buildLocation({
              to: "/calendar",
              search: { date: dateKey(start), event: event.id, account: event.accountId },
            }).href,
            open,
          );
        }, delay),
      ];
    });
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [enabled, appointments, open, router]);
};
