/**
 * What an agent may create and change (scope "write"): drafts, appointments, contacts and tasks.
 * Never deleting, and nothing leaves the company: a draft waits in Drafts for a person to send
 * it, an appointment invites only colleagues (the company's people), never anyone outside.
 * Everything goes the way the app does it – the app's compose, event and contact forms
 * (src/lib/), its invitations (src/jmap/invitations.ts), the task routes with their rights and
 * notices – with the agent's own Stalwart token.
 */

import { listCalendars } from "@/jmap/calendar";
import type { JmapClient } from "@/jmap/client";
import { createContact, listAddressBooks, updateContact } from "@/jmap/contacts";
import { saveEvent } from "@/jmap/invitations";
import { getEmail, listIdentities, listMailboxes, saveDraft } from "@/jmap/mail";
import type { EmailAddress, Identity } from "@/jmap/types";
import { parseAddresses } from "@/lib/addresses";
import { startCompose } from "@/lib/compose";
import { formToEvent, newEventForm } from "@/lib/event-form";
import { textToHtml } from "@/lib/html";
import {
  type ContactCard,
  type ContactForm,
  emptyContactForm,
  formToCard,
  fullName,
  primaryEmail,
  toForm,
} from "@/lib/jscontact";
import { findRole } from "@/lib/mailboxes";
import { contactLink } from "@/lib/task-context";
import { mailLink } from "@/lib/tasks";
import type { Task, TaskLink } from "../tasks/tasks";
import { bodyText, htmlToText } from "./format";
import type { AccountInfo, Reader } from "./reader";

/** The task routes (server/tasks/routes.ts), called as the agent's owner. */
export type TaskApi = (
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
) => Promise<{ status: number; body: Record<string, unknown> }>;

/** A TaskApi on top of the task routes' Hono app, called in-process. */
export const taskApiOf =
  (routes: {
    request: (path: string, init: RequestInit) => Response | Promise<Response>;
  }): TaskApi =>
  async (method, path, body) => {
    const response = await routes.request(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };

export type WriterDeps = { client: JmapClient; reader: Reader; taskApi: TaskApi };

export type Done = { message: string } & Record<string, unknown>;

const addresses = (list: string[] | undefined, what: string): EmailAddress[] => {
  const { addresses: parsed, invalid } = parseAddresses((list ?? []).join(", "));
  if (invalid.length) throw new Error(`${what}: keine gültige Adresse: ${invalid.join(", ")}`);
  return parsed;
};

/** The sender for an account: the identity with the account's address, else its first one. */
export const senderOf = (identities: Identity[], account: AccountInfo): Identity | undefined =>
  identities.find((identity) => identity.email.toLowerCase() === account.name.toLowerCase()) ??
  identities[0];

type Colleague = { id: string; name: string; email: string | null };

/**
 * The colleagues an agent invites, by address or by id from list_colleagues; anyone else is
 * refused, so no invitation leaves the company. The organizer is left out.
 */
export const colleagueAddresses = (
  wanted: string[],
  team: Colleague[],
  organizer: string,
): string[] => {
  const emailOf = new Map(
    team.flatMap(({ id, email }) =>
      email ? [id, email.toLowerCase()].map((key) => [key, email.toLowerCase()] as const) : [],
    ),
  );
  // An entry is an id or addresses; every address in it must be a colleague's.
  const lookup = (entry: string): string[] | null => {
    const byId = emailOf.get(entry.trim());
    if (byId) return [byId];
    const { addresses, invalid } = parseAddresses(entry);
    const emails = addresses.map(({ email }) => emailOf.get(email.toLowerCase()));
    if (invalid.length || !emails.length || emails.some((email) => !email)) return null;
    return emails as string[];
  };
  const outside = wanted.filter((entry) => !lookup(entry));
  if (outside.length) {
    throw new Error(
      `Nur Kollegen der Firma können eingeladen werden (list_colleagues), nicht: ${outside.join(", ")}`,
    );
  }
  const emails = new Set(wanted.flatMap((entry) => lookup(entry)!));
  emails.delete(organizer.toLowerCase());
  return [...emails];
};

const taskError = (body: Record<string, unknown>) =>
  new Error(String(body.error ?? "Aufgabe nicht gespeichert"));

export const createWriter = ({ client, reader, taskApi }: WriterDeps) => {
  /** An account to write in: the one asked for, else the own mailbox. */
  const accountFor = async (has: "mail" | "calendars" | "contacts", accountId?: string) => {
    const accounts = await reader.accounts();
    const account = accountId
      ? accounts.find((candidate) => candidate.id === accountId)
      : accounts.find((candidate) => candidate.personal);
    if (!account?.[has]) throw new Error(`Unbekanntes Konto: ${accountId ?? "eigenes Postfach"}`);
    if (account.readOnly) throw new Error(`${account.name} ist nur zum Lesen freigegeben.`);
    return account;
  };

  const createDraft = async (input: {
    accountId?: string;
    to?: string[];
    cc?: string[];
    subject?: string;
    text: string;
    replyToEmailId?: string;
    replyAll?: boolean;
  }): Promise<Done> => {
    const account = await accountFor("mail", input.accountId);
    const [identities, mailboxes] = await Promise.all([
      listIdentities(client, account.id),
      listMailboxes(client, account.id),
    ]);
    const identity = senderOf(identities, account);
    if (!identity) throw new Error(`In ${account.name} gibt es keine Absenderadresse.`);
    const drafts = findRole(mailboxes, "drafts");
    if (!drafts) throw new Error(`${account.name} hat keinen Ordner „Entwürfe“.`);
    const original = input.replyToEmailId
      ? await getEmail(client, account.id, input.replyToEmailId)
      : null;
    if (input.replyToEmailId && !original) {
      throw new Error(`Mail nicht gefunden: ${input.replyToEmailId}`);
    }
    // A reply as the app makes it: recipients, "Re:", the original quoted, the thread headers.
    const reply = original
      ? startCompose(
          input.replyAll ? "replyAll" : "reply",
          original,
          textToHtml(bodyText(original)),
          identities.map((own) => own.email),
        )
      : null;
    const to = input.to?.length ? addresses(input.to, "An") : (reply?.to ?? []);
    const cc = input.cc?.length ? addresses(input.cc, "Cc") : (reply?.cc ?? []);
    if (!to.length) throw new Error("Der Entwurf braucht einen Empfänger.");
    // The reply's quote stays below the agent's text, as in the app; the text part follows it.
    const typed = textToHtml(input.text);
    const html = reply ? `${typed}${reply.html.replace(/^<p><\/p>/, "")}` : typed;
    const draftId = await saveDraft(
      client,
      {
        accountId: account.id,
        identity,
        to,
        cc,
        bcc: [],
        subject: input.subject ?? reply?.subject ?? "",
        html,
        text: htmlToText(html),
        attachments: [],
        inReplyTo: reply?.inReplyTo ?? null,
        references: reply?.references ?? null,
      },
      drafts.id,
    );
    return {
      message: `Entwurf an ${to.map((a) => a.email).join(", ")} liegt in „Entwürfe“ von ${account.name}. Er wird erst gesendet, wenn ihn jemand in Kontext abschickt.`,
      accountId: account.id,
      emailId: draftId,
    };
  };

  const createAppointment = async (input: {
    accountId?: string;
    calendarId?: string;
    title: string;
    start: string;
    end?: string;
    durationMinutes?: number;
    allDay?: boolean;
    location?: string;
    description?: string;
    attendees?: string[];
  }): Promise<Done> => {
    const account = await accountFor("calendars", input.accountId);
    const calendars = await listCalendars(client, account.id);
    const calendar = input.calendarId
      ? calendars.find((candidate) => candidate.id === input.calendarId)
      : (calendars.find((candidate) => candidate.isDefault) ?? calendars[0]);
    if (!calendar) throw new Error(`Kein Kalender in ${account.name}.`);
    const invited = input.attendees?.length
      ? colleagueAddresses(input.attendees, await reader.colleagues(), account.name)
      : [];
    const form = { ...appointmentForm(input), attendees: invited.join(", ") };
    const event = formToEvent(form, { email: account.name });
    // As the app saves it: Kontext mails the invitations from the organizer; colleagues answer
    // in their calendar, so no answer links (/api/invitations/links) are signed.
    const id = await saveEvent(
      client,
      account.id,
      { kind: "create", calendarId: calendar.id, event },
      async () => ({}),
    );
    const when = form.allDay ? form.date : `${form.date} ${form.startTime}–${form.endTime}`;
    const invitedText = invited.length ? `; eingeladen: ${invited.join(", ")}` : "";
    return {
      message: `Termin „${form.title}“ am ${when} in „${calendar.name}“ eingetragen${invitedText}.`,
      accountId: account.id,
      eventId: id,
    };
  };

  const contactForm = (patch: Partial<ContactForm>, base: ContactForm) =>
    Object.fromEntries(
      Object.entries(base).map(([key, value]) => [key, patch[key as keyof ContactForm] ?? value]),
    ) as ContactForm;

  const createCard = async (
    input: { accountId?: string; addressBookId?: string } & Partial<ContactForm>,
  ): Promise<Done> => {
    const { accountId, addressBookId, ...fields } = input;
    const account = await accountFor("contacts", accountId);
    const books = await listAddressBooks(client, account.id);
    const book = addressBookId
      ? books.find((candidate) => candidate.id === addressBookId)
      : (books.find((candidate) => candidate.isDefault) ?? books[0]);
    if (!book) throw new Error(`Kein Adressbuch in ${account.name}.`);
    const form = contactForm(fields, emptyContactForm);
    if (!form.given.trim() && !form.surname.trim() && !form.company.trim()) {
      throw new Error("Der Kontakt braucht einen Namen oder eine Firma.");
    }
    const id = await createContact(client, account.id, book.id, formToCard(form));
    return {
      message: `Kontakt ${[form.given, form.surname].join(" ").trim() || form.company} in ${book.name} angelegt.`,
      accountId: account.id,
      contactId: id,
    };
  };

  const updateCard = async (
    input: { accountId: string; contactId: string } & Partial<ContactForm>,
  ): Promise<Done> => {
    const { accountId, contactId, ...fields } = input;
    const account = await accountFor("contacts", accountId);
    const { list } = await client.call<{ list: ContactCard[] }>("ContactCard/get", {
      accountId: account.id,
      ids: [contactId],
    });
    const card = list[0];
    if (!card) throw new Error(`Kontakt nicht gefunden: ${contactId}`);
    await updateContact(
      client,
      account.id,
      contactId,
      formToCard(contactForm(fields, toForm(card)), card),
    );
    return {
      message: `Kontakt ${fullName(card) || contactId} geändert: ${Object.keys(fields).join(", ")}.`,
      accountId: account.id,
      contactId,
    };
  };

  /** The links of a new task: to a mail (its conversation) and to a contact. */
  const linksFor = async (input: {
    email?: { accountId: string; emailId: string };
    contact?: { accountId: string; contactId: string };
  }): Promise<TaskLink[]> => {
    const links: TaskLink[] = [];
    if (input.email) {
      const email = await getEmail(client, input.email.accountId, input.email.emailId);
      if (!email) throw new Error(`Mail nicht gefunden: ${input.email.emailId}`);
      links.push(mailLink(input.email.accountId, email));
    }
    if (input.contact) {
      const { list } = await client.call<{ list: ContactCard[] }>("ContactCard/get", {
        accountId: input.contact.accountId,
        ids: [input.contact.contactId],
      });
      const card = list[0];
      if (!card) throw new Error(`Kontakt nicht gefunden: ${input.contact.contactId}`);
      links.push(
        contactLink(
          { accountId: input.contact.accountId, id: card.id },
          fullName(card),
          primaryEmail(card),
        ),
      );
    }
    return links;
  };

  const createTask = async (input: {
    accountId?: string;
    title: string;
    notes?: string;
    dueDate?: string;
    dueTime?: string;
    assigneeId?: string;
    email?: { accountId: string; emailId: string };
    contact?: { accountId: string; contactId: string };
  }): Promise<Done> => {
    const accounts = await reader.accounts();
    const board = input.accountId ?? accounts.find((account) => account.personal)?.id;
    const { status, body } = await taskApi("POST", "/", {
      accountId: board,
      title: input.title,
      notes: input.notes ?? "",
      dueDate: input.dueDate ?? null,
      dueTime: input.dueTime ?? null,
      assigneeId: input.assigneeId ?? null,
      links: await linksFor(input),
    });
    if (status !== 201) throw taskError(body);
    const task = body.task as Task;
    return {
      message: `Aufgabe „${task.title}“ angelegt${task.dueDate ? `, fällig ${task.dueDate}` : ""}.`,
      taskId: task.id,
    };
  };

  const updateTask = async (input: {
    taskId: string;
    title?: string;
    notes?: string;
    status?: string;
    dueDate?: string | null;
    dueTime?: string | null;
    assigneeId?: string | null;
  }): Promise<Done> => {
    const { taskId, ...patch } = input;
    const { status, body } = await taskApi("PATCH", `/${encodeURIComponent(taskId)}`, patch);
    if (status !== 200) throw taskError(body);
    const task = body.task as Task;
    return {
      message: `Aufgabe „${task.title}“ geändert: ${Object.keys(patch).join(", ")}.`,
      taskId: task.id,
    };
  };

  return { createDraft, createAppointment, createCard, updateCard, createTask, updateTask };
};

export type Writer = ReturnType<typeof createWriter>;

/** "2026-11-03 09:00" or "2026-11-03T09:00" → date and time; a bare day is all day. */
const splitLocal = (value: string): { date: string; time: string | null } => {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/);
  if (!match) throw new Error(`Kein Datum: ${value} (erwartet YYYY-MM-DD HH:mm)`);
  return { date: match[1]!, time: match[2] ?? null };
};

/** The event form for an agent's appointment, in local time (Europe/Berlin). */
export const appointmentForm = (input: {
  title: string;
  start: string;
  end?: string;
  durationMinutes?: number;
  allDay?: boolean;
  location?: string;
  description?: string;
}) => {
  const start = splitLocal(input.start);
  const allDay = input.allDay ?? start.time === null;
  const form = newEventForm(`${start.date}T${start.time ?? "09:00"}`, input.durationMinutes ?? 60);
  const end = input.end ? splitLocal(input.end) : null;
  const filled = {
    ...form,
    title: input.title.trim(),
    allDay,
    location: input.location ?? "",
    description: input.description ?? "",
    ...(end ? { endDate: end.date, endTime: end.time ?? form.endTime } : {}),
    ...(allDay ? { endDate: end?.date ?? start.date } : {}),
  };
  if (!filled.title) throw new Error("Der Termin braucht einen Titel.");
  const from = allDay ? filled.date : `${filled.date}T${filled.startTime}`;
  const to = allDay ? filled.endDate : `${filled.endDate}T${filled.endTime}`;
  if (to < from) throw new Error("Das Ende liegt vor dem Anfang.");
  return filled;
};
