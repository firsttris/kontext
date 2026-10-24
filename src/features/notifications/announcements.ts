/**
 * System notifications on this device, when switched on: a new mail while Kontext is in the
 * background, and a reminder 15 minutes before an appointment. A click brings the tab to the front
 * and opens the mail or the appointment.
 */
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
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

const show = (title: string, body: string, tag: string, open: () => void) => {
  const notification = new Notification(title, { body, tag, icon: "/icon-192.png" });
  notification.onclick = () => {
    window.focus();
    open();
    notification.close();
  };
};

export const useAnnouncements = (mails: InboxMail[], appointments: FeedEvent[]) => {
  const enabled = useDeviceNotifications();
  const navigate = useNavigate();
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
        () =>
          void navigate({
            to: "/mail/$accountId/$mailboxId",
            params: { accountId: mail.accountId, mailboxId: "inbox" },
            search: { email: mail.email.id },
          }),
      );
    }
  }, [enabled, mails, navigate]);

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
            () =>
              void navigate({
                to: "/calendar",
                search: { date: dateKey(start), event: event.id, account: event.accountId },
              }),
          );
        }, delay),
      ];
    });
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [enabled, appointments, navigate]);
};
