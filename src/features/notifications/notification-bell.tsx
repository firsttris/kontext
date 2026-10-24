/**
 * The bell in the rail: a dot when something arrived since it was last opened; opened, the
 * invitations to answer, the rest of today's appointments and the new mail, each one click away,
 * and the switch for notifications on this device.
 */
import * as Popover from "@radix-ui/react-popover";
import { Link } from "@tanstack/react-router";
import { Bell, CalendarCheck, CalendarDays, CheckCheck } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/cn";
import { displayName, listDate } from "@/lib/format";
import { dateKey, locationName, toLocal } from "@/lib/jscalendar";
import { unseenCount } from "@/lib/notifications";
import { m } from "@/paraglide/messages";
import { useAnnouncements } from "./announcements";
import { markSeen, notificationsSupported, useSeen } from "./device-settings";
import { DeviceSwitch } from "./device-switch";
import { type FeedEvent, useNotificationFeed } from "./feed";

/** A minute is fine enough for "today" and for reminders. */
const useNow = (): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
};

const dayFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const MAX_MAILS = 8;

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-0.5">
    <h3 className="m-0 px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
      {title}
    </h3>
    {children}
  </section>
);

const row =
  "flex items-start gap-3 rounded-lg px-2 py-2 text-[13px] text-fg no-underline hover:bg-hover";

const EventRow = ({ item, invitation }: { item: FeedEvent; invitation?: boolean }) => {
  const place = locationName(item.event);
  return (
    <Popover.Close asChild>
      <Link
        to="/calendar"
        search={{ date: dateKey(item.start), event: item.event.id, account: item.event.accountId }}
        className={row}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            invitation ? "bg-accent/10 text-accent" : "bg-subtle text-muted",
          )}
        >
          {invitation ? <CalendarCheck size={15} /> : <CalendarDays size={15} />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{item.title || m.notifications_untitled()}</span>
          <span className="truncate text-[12px] text-muted">
            {invitation ? `${dayFormat.format(item.start)}, ` : ""}
            {toLocal(item.start).slice(11, 16)}
            {place ? ` · ${place}` : ""}
          </span>
        </span>
      </Link>
    </Popover.Close>
  );
};

export const NotificationBell = ({ className }: { className: string }) => {
  const now = useNow();
  const { mails, invitations, appointments } = useNotificationFeed(now);
  useAnnouncements(mails, appointments);
  const seen = useSeen();
  const unseen =
    unseenCount(
      mails.map((mail) => new Date(mail.email.receivedAt)),
      seen.at,
    ) + invitations.filter((item) => !seen.invitations.includes(item.key)).length;
  const label = unseen > 0 ? m.notifications_open_new({ count: unseen }) : m.notifications_title();
  const empty = mails.length + invitations.length + appointments.length === 0;

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (open)
          markSeen(
            Date.now(),
            invitations.map((item) => item.key),
          );
      }}
    >
      <Popover.Trigger aria-label={label} title={label} className={cn(className, "relative")}>
        <Bell size={18} strokeWidth={1.75} />
        {unseen > 0 ? (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 size-2 rounded-full bg-accent ring-2 ring-side"
          />
        ) : null}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={10}
          aria-label={m.notifications_title()}
          className="z-50 flex max-h-[min(640px,80dvh)] w-[360px] flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-lg"
        >
          <header className="flex items-baseline justify-between border-b border-border px-4 py-3">
            <h2 className="m-0 text-[15px] font-semibold">{m.notifications_title()}</h2>
            {mails.length ? (
              <span className="text-[12px] text-muted">
                {m.mail_unread_count({ count: mails.length })}
              </span>
            ) : null}
          </header>
          <div className="flex flex-col gap-3 overflow-y-auto p-2">
            {empty ? (
              <p className="m-0 flex flex-col items-center gap-2 px-6 py-8 text-center text-[13px] text-muted">
                <CheckCheck size={22} className="text-ok" />
                {m.notifications_empty()}
              </p>
            ) : null}
            {invitations.length ? (
              <Section title={m.notifications_invitations()}>
                {invitations.map((item) => (
                  <EventRow key={item.key} item={item} invitation />
                ))}
              </Section>
            ) : null}
            {appointments.length ? (
              <Section title={m.notifications_today()}>
                {appointments.map((item) => (
                  <EventRow key={item.key} item={item} />
                ))}
              </Section>
            ) : null}
            {mails.length ? (
              <Section title={m.notifications_mails()}>
                {mails.slice(0, MAX_MAILS).map(({ accountId, label: mailbox, email }) => (
                  <Popover.Close asChild key={`${accountId}/${email.id}`}>
                    <Link
                      to="/mail/$accountId/$mailboxId"
                      params={{ accountId, mailboxId: "inbox" }}
                      search={{ email: email.id }}
                      className={row}
                    >
                      <Avatar name={displayName(email.from?.[0])} size={32} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {displayName(email.from?.[0])}
                          </span>
                          <span className="shrink-0 font-mono text-[11px] text-muted">
                            {listDate(email.receivedAt, now)}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          {mailbox ? (
                            <span className="shrink-0 rounded bg-subtle px-1 text-[10px] font-medium text-muted">
                              {mailbox}
                            </span>
                          ) : null}
                          <span className="truncate text-muted">
                            {email.subject || m.mail_no_subject()}
                          </span>
                        </span>
                      </span>
                    </Link>
                  </Popover.Close>
                ))}
                {mails.length > MAX_MAILS ? (
                  <Popover.Close asChild>
                    <Link
                      to="/mail/$accountId/$mailboxId"
                      params={{ accountId: "all", mailboxId: "inbox" }}
                      search={{ unread: true }}
                      className="px-2 py-1.5 text-[12px] text-muted hover:text-fg"
                    >
                      {m.notifications_more({ count: mails.length - MAX_MAILS })}
                    </Link>
                  </Popover.Close>
                ) : null}
              </Section>
            ) : null}
          </div>
          {/* The device switch only where the browser can notify at all. */}
          {notificationsSupported() ? (
            <div className="border-t border-border px-3 py-3">
              <DeviceSwitch />
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};
