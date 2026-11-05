/** The key facts of a contact in its detail pane: every address, number, the birthday … */
import type { ReactNode } from "react";
import { birthDate } from "@/lib/birthdays";
import { toForm } from "@/lib/contact-form";
import type { ContactCard } from "@/lib/jscontact";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { phoneKindText } from "./contact-rows";

export const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-[12px] text-muted">{label}</span>
    <span className="break-words">{children}</span>
  </div>
);

/** "4. Mai 1974", or "4. Mai" when the card knows no year. */
const birthdayText = (card: ContactCard): string => {
  const date = birthDate(card);
  if (!date) return "";
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    ...(date.year ? { year: "numeric" } : {}),
  }).format(Date.UTC(date.year ?? 2000, date.month - 1, date.day));
};

/** Only web addresses become links; a vCard may carry any URI. */
const isWebAddress = (uri: string) => /^https?:\/\//i.test(uri);

export const ContactFacts = ({ card }: { card: ContactCard }) => {
  const form = toForm(card);
  const address = [form.street, `${form.postcode} ${form.city}`.trim(), form.country].filter(
    Boolean,
  );
  const birthday = birthdayText(card);
  return (
    <>
      {form.emails.map(({ key, address: email }) => (
        <Field key={key} label={m.contacts_email()}>
          <a href={`mailto:${email}`} className="text-fg">
            {email}
          </a>
        </Field>
      ))}
      {form.phones.map(({ key, number, kind }) => (
        <Field key={key} label={phoneKindText(kind)}>
          <span className="font-mono">{number}</span>
        </Field>
      ))}
      {address.length ? <Field label={m.contacts_address()}>{address.join(", ")}</Field> : null}
      {form.website ? (
        <Field label={m.contacts_website()}>
          {isWebAddress(form.website) ? (
            <a href={form.website} target="_blank" rel="noreferrer" className="text-fg">
              {form.website.replace(/^https?:\/\//i, "")}
            </a>
          ) : (
            form.website
          )}
        </Field>
      ) : null}
      {birthday ? <Field label={m.contacts_birthday()}>{birthday}</Field> : null}
    </>
  );
};
