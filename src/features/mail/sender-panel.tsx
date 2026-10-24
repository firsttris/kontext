/**
 * Beside the open mail on wide screens: who it is with (their contact card, or a button to save
 * them as one), quick actions, the next appointments and the last mails with them. It fills the
 * room a wide screen leaves next to a readable column of text.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Mail, Phone, UserPlus, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useClient } from "@/auth/auth";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { emailsWithAddress } from "@/jmap/mail";
import type { EmailDetail } from "@/jmap/types";
import { cn } from "@/lib/cn";
import { contactFormFor, correspondent, findContact } from "@/lib/correspondent";
import { displayName, listDate } from "@/lib/format";
import { dateKey, eventTimes, toLocal } from "@/lib/jscalendar";
import { company, formToCard, fullName, primaryPhone } from "@/lib/jscontact";
import { m } from "@/paraglide/messages";
import { useEventsWith } from "../calendar/queries";
import { useContactMutations, useContacts } from "../contacts/queries";
import { useMailAccounts } from "./queries";

const dayFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  day: "numeric",
  month: "short",
});

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-1">
    <h3 className="m-0 px-2 pb-1 text-[11px] font-medium tracking-wide text-muted uppercase">
      {title}
    </h3>
    {children}
  </section>
);

const rowClass =
  "flex items-start gap-2.5 rounded-lg px-2 py-2 text-[13px] text-fg no-underline hover:bg-hover";

export const SenderPanel = ({ accountId, email }: { accountId: string; email: EmailDetail }) => {
  const client = useClient();
  const toast = useToast();
  const accounts = useMailAccounts();
  const person = correspondent(
    email,
    accounts.map((account) => account.name),
  );
  const { data: contacts, books } = useContacts();
  const { create } = useContactMutations();
  const card = person ? findContact(contacts, person.email) : undefined;
  const events = useEventsWith(person?.email);
  const mails = useQuery({
    queryKey: [accountId, "emails", "with", person?.email],
    queryFn: () => emailsWithAddress(client, accountId, person!.email, 6),
    enabled: Boolean(person),
  });
  if (!person) return null;

  const name = card ? fullName(card) : displayName(person);
  const phone = card ? primaryPhone(card) : "";
  const ownBook = books.find((book) => book.isPersonal && book.mayWrite);
  const upcoming = [...(events.data ?? [])]
    .sort((a, b) => eventTimes(a).start.getTime() - eventTimes(b).start.getTime())
    .slice(0, 3);
  const others = (mails.data ?? []).filter((mail) => mail.id !== email.id).slice(0, 5);

  const save = async () => {
    if (!ownBook) return;
    try {
      await create.mutateAsync({ card: formToCard(contactFormFor(person)), book: ownBook });
      toast.show(m.mail_person_saved({ name }));
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <aside
      aria-label={m.mail_person_title({ name })}
      className="flex w-[300px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-border px-3 py-5"
    >
      <div className="flex flex-col items-center gap-2 px-2 text-center">
        <Avatar name={name} size={56} />
        <div className="flex min-w-0 max-w-full flex-col">
          <span className="truncate text-[15px] font-semibold">{name}</span>
          {card && company(card) && company(card) !== name ? (
            <span className="truncate text-[13px] text-muted">{company(card)}</span>
          ) : null}
          <span className="truncate text-[12px] text-muted">{person.email}</span>
        </div>
        <div
          className={cn(
            "mt-1 grid w-full gap-1.5 [&>*]:px-2",
            phone ? "grid-cols-3" : "grid-cols-2",
          )}
        >
          <Button asChild size="sm" variant="outline">
            <Link
              to="."
              search={{ compose: "new", to: `${name} <${person.email}>` }}
              title={m.contacts_write_mail()}
            >
              <Mail size={14} /> {m.mail_person_mail()}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/calendar" search={{ event: "new", start: `${dateKey(new Date())}T09:00` }}>
              <CalendarDays size={14} /> {m.mail_person_event()}
            </Link>
          </Button>
          {phone ? (
            <Button asChild size="sm" variant="outline">
              <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
                <Phone size={14} /> {m.contacts_call()}
              </a>
            </Button>
          ) : null}
        </div>
        {card ? (
          <Link
            to="/contacts"
            search={{ id: card.id, account: card.accountId }}
            className="flex items-center gap-1 text-[12px] text-muted hover:text-fg"
          >
            <UserRound size={13} /> {m.mail_person_open_contact()}
          </Link>
        ) : ownBook ? (
          <button
            type="button"
            onClick={() => void save()}
            disabled={create.isPending}
            className="flex items-center gap-1 text-[12px] text-muted hover:text-fg"
          >
            <UserPlus size={13} /> {m.mail_person_save_contact()}
          </button>
        ) : null}
      </div>

      {upcoming.length > 0 ? (
        <Section title={m.contacts_upcoming()}>
          {upcoming.map((event) => {
            const { start, allDay } = eventTimes(event);
            return (
              <Link
                key={event.id}
                to="/calendar"
                search={{ date: dateKey(start), event: event.id }}
                className={rowClass}
              >
                <CalendarDays size={14} className="mt-0.5 shrink-0 text-muted" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">{event.title}</span>
                  <span className="text-[12px] text-muted">
                    {dayFormat.format(start)}
                    {allDay ? "" : `, ${toLocal(start).slice(11, 16)}`}
                  </span>
                </span>
              </Link>
            );
          })}
        </Section>
      ) : null}

      <Section title={m.contacts_recent_mails()}>
        {others.length === 0 ? (
          <p className="m-0 px-2 text-[13px] text-muted">{m.mail_person_no_other_mails()}</p>
        ) : (
          others.map((mail) => (
            <Link
              key={mail.id}
              to="/mail/$accountId/$mailboxId"
              params={{ accountId, mailboxId: Object.keys(mail.mailboxIds)[0] ?? "inbox" }}
              search={{ email: mail.id }}
              className={rowClass}
            >
              <Mail size={14} className="mt-0.5 shrink-0 text-muted" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{mail.subject || m.mail_no_subject()}</span>
                <span className="text-[12px] text-muted">
                  {listDate(mail.receivedAt, new Date())}
                </span>
              </span>
            </Link>
          ))
        )}
      </Section>
    </aside>
  );
};
