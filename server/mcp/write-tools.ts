/**
 * The tools that create and change (scope "write"): a draft, an appointment, a contact, a task.
 * None deletes, and nothing leaves the company: mail outside is sent by a person in Kontext, an
 * appointment invites colleagues only. Each answers with a `message` that also goes into the
 * connection's log.
 */
import { z } from "zod";
import { CLOCK_TIME } from "../tasks/tasks";
import { tool } from "./tool";

const optionalText = (what: string) => z.string().max(10_000).optional().describe(what);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(CLOCK_TIME);

const contactFields = {
  given: z.string().max(200).optional().describe("First name."),
  surname: z.string().max(200).optional().describe("Last name."),
  company: z.string().max(200).optional().describe("Company."),
  email: z.string().max(320).optional().describe("E-mail address."),
  phone: z.string().max(100).optional().describe("Phone number."),
  street: z.string().max(300).optional().describe("Street and number."),
  city: z.string().max(200).optional().describe("Postcode and town."),
  note: optionalText("Note."),
};

const ref = (what: string) =>
  z.object({ accountId: z.string(), id: z.string() }).optional().describe(what);

export const WRITE_TOOLS = [
  tool({
    name: "create_draft",
    title: "Entwurf anlegen",
    description:
      "Write a mail as a draft in the Drafts folder of the own or a shared mailbox. It is NOT " +
      "sent: a person checks and sends it in Kontext. For a reply give replyToEmailId; " +
      "recipients, 'Re:' subject, quote and thread headers then come from the original.",
    scope: "write",
    input: {
      text: z.string().min(1).max(50_000).describe("The mail's text (plain text)."),
      to: z.array(z.string()).max(50).optional().describe("Recipients; for a reply optional."),
      cc: z.array(z.string()).max(50).optional().describe("Copy to."),
      subject: z.string().max(500).optional().describe("Subject; for a reply optional."),
      accountId: z
        .string()
        .optional()
        .describe("The mailbox to write from (e.g. info@'s id); the own one when left out."),
      replyToEmailId: z
        .string()
        .optional()
        .describe("The mail answered, in that same account (accountId)."),
      replyAll: z.boolean().default(false).describe("Reply to all recipients of the original."),
    },
    run: ({ writer }, input) => writer.createDraft(input),
  }),
  tool({
    name: "create_event",
    title: "Termin eintragen",
    description:
      "Put an appointment into a calendar (own or shared mailbox), in German local time, and " +
      "invite colleagues: they get an invitation mail and the event in their calendar. Only " +
      "the company's people (list_colleagues) can be invited; people outside are refused – " +
      "mention them in the description and the user invites them in Kontext.",
    scope: "write",
    input: {
      title: z.string().min(1).max(300).describe("What it is."),
      start: z
        .string()
        .describe("'YYYY-MM-DD HH:mm' (local time), or 'YYYY-MM-DD' for an all-day event."),
      end: z.string().optional().describe("'YYYY-MM-DD HH:mm' or 'YYYY-MM-DD'."),
      durationMinutes: z
        .number()
        .int()
        .min(5)
        .max(24 * 60)
        .optional()
        .describe("Instead of end; 60 when neither is given."),
      allDay: z.boolean().optional(),
      location: z.string().max(500).optional(),
      description: optionalText("Notes."),
      attendees: z
        .array(z.string())
        .max(50)
        .optional()
        .describe("Colleagues to invite: their e-mail address or id from list_colleagues."),
      accountId: z.string().optional().describe("Whose calendar; the own one when left out."),
      calendarId: z.string().optional().describe("Which calendar; the default one when left out."),
    },
    run: ({ writer }, input) => writer.createAppointment(input),
  }),
  tool({
    name: "create_contact",
    title: "Kontakt anlegen",
    description: "Add a contact (customer, supplier …) to an address book.",
    scope: "write",
    input: {
      ...contactFields,
      accountId: z.string().optional().describe("Whose address book; the own one when left out."),
      addressBookId: z.string().optional().describe("Which one; the default one when left out."),
    },
    run: ({ writer }, input) => writer.createCard(input),
  }),
  tool({
    name: "update_contact",
    title: "Kontakt ändern",
    description:
      "Change fields of a contact (from search_contacts). Fields left out stay as they are; an " +
      "empty string removes the field.",
    scope: "write",
    input: {
      accountId: z.string().describe("The contact's account."),
      contactId: z.string().describe("The contact's id."),
      ...contactFields,
    },
    run: ({ writer }, input) => writer.updateCard(input),
  }),
  tool({
    name: "create_task",
    title: "Aufgabe anlegen",
    description:
      "Create a task on a board (the own one, a shared mailbox's, or a project board of " +
      "either), optionally due on a day, " +
      "given to a colleague (list_colleagues) and linked to a mail and/or a contact.",
    scope: "write",
    input: {
      title: z.string().min(1).max(300),
      notes: optionalText("Details."),
      dueDate: day.optional().describe("YYYY-MM-DD."),
      dueTime: time.optional().describe("HH:mm."),
      assigneeId: z.string().optional().describe("A colleague's id from list_colleagues."),
      accountId: z
        .string()
        .optional()
        .describe("The board (an account id); the own one when left out."),
      projectId: z
        .string()
        .optional()
        .describe("A project board of that account (projectId from list_tasks)."),
      email: ref("A mail to link: its accountId and id."),
      contact: ref("A contact to link: its accountId and id."),
    },
    run: ({ writer }, { email, contact, ...input }) =>
      writer.createTask({
        ...input,
        email: email && { accountId: email.accountId, emailId: email.id },
        contact: contact && { accountId: contact.accountId, contactId: contact.id },
      }),
  }),
  tool({
    name: "update_task",
    title: "Aufgabe ändern",
    description:
      "Change a task (from list_tasks): title, notes, due date, assignee, or its column " +
      "(status: open, doing, waiting, done or a board's own). status 'done' finishes it.",
    scope: "write",
    input: {
      taskId: z.string(),
      title: z.string().min(1).max(300).optional(),
      notes: optionalText("Details (replaces the old ones)."),
      status: z.string().optional(),
      dueDate: day.nullable().optional().describe("YYYY-MM-DD, or null to remove."),
      dueTime: time.nullable().optional().describe("HH:mm, or null to remove."),
      assigneeId: z.string().nullable().optional().describe("A colleague's id, or null."),
    },
    run: ({ writer }, input) => writer.updateTask(input),
  }),
];
