/**
 * Who a number is: the contact in one's address books (also shared ones), their company, the
 * latest mail with them and the next appointment – what one wants to know while it rings.
 */
import { useQuery } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { useEventsWith } from "@/features/calendar/queries";
import { type Contact, useContacts } from "@/features/contacts/queries";
import { CAPABILITIES } from "@/jmap/client";
import { emailsWithAddress } from "@/jmap/mail";
import { eventTimes } from "@/lib/jscalendar";
import { company, fullName, primaryEmail } from "@/lib/jscontact";
import { contactOfNumber, readableNumber } from "@/lib/phone";

export type Caller = {
  contact: Contact | null;
  /** The contact's name, else the number. */
  name: string;
  company: string;
};

export const useCallerName = (number: string): Caller => {
  const { data: contacts } = useContacts();
  const contact = contactOfNumber(contacts, number);
  return {
    contact,
    name: contact ? fullName(contact) : readableNumber(number),
    company: contact ? company(contact) : "",
  };
};

/** The latest mail and the next appointment with the caller, once they are known. */
export const useCallerContext = (contact: Contact | null) => {
  const client = useClient();
  const { data: session } = useSession();
  const mailAccountId = session?.primaryAccounts[CAPABILITIES.mail];
  const email = contact ? primaryEmail(contact) : "";
  const mails = useQuery({
    queryKey: [mailAccountId, "emails", "with", email],
    queryFn: () => emailsWithAddress(client, mailAccountId!, email),
    enabled: Boolean(mailAccountId && email),
  });
  const events = useEventsWith(email || undefined);
  const next = [...(events.data ?? [])].sort(
    (a, b) => eventTimes(a).start.getTime() - eventTimes(b).start.getTime(),
  )[0];
  return { lastMail: mails.data?.[0] ?? null, nextEvent: next ?? null };
};
