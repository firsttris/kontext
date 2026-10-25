/** One contact, as in the mockup: actions, key facts, recent mails and appointments, details. */

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, ChevronLeft, Download, Mail, Pencil, Phone } from "lucide-react";
import type { ReactNode } from "react";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CAPABILITIES } from "@/jmap/client";
import { emailsWithAddress } from "@/jmap/mail";
import { downloadText } from "@/lib/download";
import { displayName, listDate } from "@/lib/format";
import { groupsOf } from "@/lib/groups";
import { dateKey, eventTimes, locationName, toLocal } from "@/lib/jscalendar";
import { addressLines, company, fullName, note, primaryEmail, primaryPhone } from "@/lib/jscontact";
import { toVCard } from "@/lib/vcard";
import { m } from "@/paraglide/messages";
import { useEventsWith } from "../calendar/queries";
import { usePhoneDial } from "../phone/phone-page";
import { ContactTasks } from "./contact-tasks";
import { type BookRef, bookOf, type Contact } from "./queries";

const Card = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-3 rounded-xl border border-border p-4">
    <h3 className="m-0 text-[13px] font-semibold">{title}</h3>
    {children}
  </section>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[12px] text-muted">{label}</span>
    <span className="break-words">{children}</span>
  </div>
);

const dayFormat = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "short",
  day: "numeric",
  month: "short",
});

type Props = {
  card: Contact;
  books: BookRef[];
  /** The groups of the card's account; those it belongs to are listed. */
  groups: Contact[];
};

export const ContactDetail = ({ card, books, groups }: Props) => {
  const memberOf = groupsOf(card, groups);
  const book = bookOf(books, card);
  const client = useClient();
  const { data: session } = useSession();
  const mailAccountId = session?.primaryAccounts[CAPABILITIES.mail];
  const email = primaryEmail(card);
  const phone = primaryPhone(card);
  const phoneDial = usePhoneDial();
  const { street, city } = addressLines(card);
  const mails = useQuery({
    queryKey: [mailAccountId, "emails", "with", email],
    queryFn: () => emailsWithAddress(client, mailAccountId!, email),
    enabled: Boolean(mailAccountId && email),
  });
  const events = useEventsWith(email || undefined);
  const upcoming = (events.data ?? []).sort(
    (a, b) => eventTimes(a).start.getTime() - eventTimes(b).start.getTime(),
  );
  const next = upcoming[0];
  const threadIds = new Set(
    (mails.data ?? []).flatMap((mail) => (mail.threadId ? [mail.threadId] : [])),
  );

  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-7 px-4 pt-3 pb-10 md:px-10 md:pt-9">
      <Link
        to="/contacts"
        search={{}}
        className="flex items-center gap-1 text-[14px] text-muted no-underline md:hidden"
      >
        <ChevronLeft size={18} /> {m.contacts_title()}
      </Link>
      <header className="flex flex-wrap items-center gap-5">
        <Avatar name={fullName(card)} size={64} className="border-0 bg-primary text-onprimary" />
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <h2 className="m-0 text-[26px] font-semibold tracking-tight">{fullName(card)}</h2>
          {company(card) && company(card) !== fullName(card) ? (
            <span className="text-muted">{company(card)}</span>
          ) : null}
          {book && !book.isPersonal ? (
            <span className="text-[13px] text-muted">
              {book.mayWrite
                ? m.contacts_shared_from({ owner: book.owner })
                : m.contacts_read_only({ owner: book.owner })}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {email && mailAccountId ? (
            <Button asChild variant="primary">
              <Link
                to="/mail/$accountId/$mailboxId"
                params={{ accountId: mailAccountId, mailboxId: "inbox" }}
                search={{ compose: "new", to: `${fullName(card)} <${email}>` }}
              >
                <Mail size={15} /> {m.contacts_write_mail()}
              </Link>
            </Button>
          ) : null}
          {phone && phoneDial.available ? (
            <Button disabled={phoneDial.busy} onClick={() => void phoneDial.dial(phone)}>
              <Phone size={15} /> {m.contacts_call()}
            </Button>
          ) : phone ? (
            <Button asChild>
              <a href={`tel:${phone.replace(/[^+\d]/g, "")}`}>
                <Phone size={15} /> {m.contacts_call()}
              </a>
            </Button>
          ) : null}
          <Button asChild>
            <Link to="/calendar" search={{ event: "new", start: `${dateKey(new Date())}T09:00` }}>
              <CalendarDays size={15} /> {m.calendar_new()}
            </Link>
          </Button>
          <Button
            variant="ghost"
            onClick={() => downloadText(toVCard(card), `${fullName(card)}.vcf`, "text/vcard")}
            title={m.contacts_export()}
          >
            <Download size={15} /> {m.contacts_export_one()}
          </Button>
          {book?.mayWrite ? (
            <Button asChild variant="ghost">
              <Link to="/contacts" search={(prev) => ({ ...prev, id: card.id, edit: true })}>
                <Pencil size={15} /> {m.contacts_edit()}
              </Link>
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-7">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-6">
          <ContactTasks card={card} name={fullName(card)} email={email} threadIds={threadIds} />
          <section className="flex flex-col gap-2">
            <h3 className="m-0 border-b border-border pb-2 text-[14px] font-semibold">
              {m.contacts_upcoming()}
            </h3>
            {upcoming.length === 0 ? (
              <p className="m-0 text-[14px] text-muted">{m.contacts_no_events()}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {upcoming.slice(0, 5).map((event) => {
                  const { start, allDay } = eventTimes(event);
                  return (
                    <li key={event.id} className="border-b border-border last:border-0">
                      <Link
                        to="/calendar"
                        search={{ date: dateKey(start), event: event.id }}
                        className="flex gap-3.5 py-3 text-fg no-underline"
                      >
                        <span
                          aria-hidden="true"
                          className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-subtle text-muted"
                        >
                          <CalendarDays size={15} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="font-medium">{event.title}</span>
                          <span className="text-[13px] text-muted">
                            {dayFormat.format(start)}
                            {allDay ? "" : `, ${toLocal(start).slice(11, 16)}`}
                            {locationName(event) ? ` · ${locationName(event)}` : ""}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <h3 className="m-0 border-b border-border pb-2 text-[14px] font-semibold">
              {m.contacts_recent_mails()}
            </h3>
            {(mails.data ?? []).length === 0 ? (
              <p className="m-0 text-[14px] text-muted">{m.contacts_no_mails()}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {(mails.data ?? []).map((mail) => (
                  <li key={mail.id} className="border-b border-border last:border-0">
                    <Link
                      to="/mail/$accountId/$mailboxId"
                      params={{
                        accountId: mailAccountId!,
                        mailboxId: Object.keys(mail.mailboxIds)[0] ?? "inbox",
                      }}
                      search={{ email: mail.id }}
                      className="flex gap-3.5 py-3 text-fg no-underline"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-subtle text-muted"
                      >
                        <Mail size={15} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="flex gap-2">
                          <span className="flex-1 truncate font-medium">{mail.subject}</span>
                          <span className="shrink-0 font-mono text-[12px] text-muted">
                            {listDate(mail.receivedAt, new Date())}
                          </span>
                        </span>
                        <span className="truncate text-[13px] text-muted">
                          {displayName(mail.from?.[0])} · {mail.preview}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside className="flex flex-[1_1_260px] flex-col gap-4">
          <Card title="Kontakt">
            {email ? (
              <Field label={m.contacts_email()}>
                <a href={`mailto:${email}`} className="text-fg">
                  {email}
                </a>
              </Field>
            ) : null}
            {phone ? (
              <Field label={m.contacts_phone()}>
                <span className="font-mono">{phone}</span>
              </Field>
            ) : null}
            {street || city ? (
              <Field label="Adresse">{[street, city].filter(Boolean).join(", ")}</Field>
            ) : null}
            {next ? (
              <Field label={m.contacts_upcoming()}>
                {next.title} · {dayFormat.format(eventTimes(next).start)}
              </Field>
            ) : null}
          </Card>
          {memberOf.length > 0 ? (
            <Card title={m.contacts_member_of()}>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
                {memberOf.map((group) => (
                  <li key={group.id}>
                    <Link
                      to="/contacts"
                      search={(prev) => ({ book: prev.book, id: group.id, account: prev.account })}
                      className="inline-flex h-7 items-center rounded-full border border-border px-3 text-[13px] text-fg no-underline hover:bg-hover"
                    >
                      {fullName(group)}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {note(card) ? (
            <Card title={m.contacts_note()}>
              <p className="m-0 whitespace-pre-line text-muted">{note(card)}</p>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
};
