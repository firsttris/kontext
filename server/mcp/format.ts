/**
 * What the agent gets back: JMAP's mails, cards and events made small and plain – text instead
 * of HTML, local times in Europe/Berlin, only the fields worth reading. Every result keeps the
 * ids needed to ask further (account, mail, thread). Pure.
 */
import type { EmailAddress, EmailDetail, EmailSummary } from "@/jmap/types";
import { type CalendarEvent, eventTimes, locationName, participantEmail } from "@/lib/jscalendar";
import { type ContactCard, company, fullName, note } from "@/lib/jscontact";
import type { Task } from "../tasks/tasks";

const ZONE = "Europe/Berlin";

/** "2026-10-25 14:30" in German local time; the agent reads it better than UTC. */
export const localTime = (instant: Date | string): string =>
  new Date(instant).toLocaleString("sv-SE", { timeZone: ZONE }).slice(0, 16);

const address = ({ name, email }: EmailAddress): string => (name ? `${name} <${email}>` : email);
const addresses = (list: EmailAddress[] | null | undefined): string[] => (list ?? []).map(address);

/** Cut long text, saying so, so the agent knows there is more. */
export const clip = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, max)} … [gekürzt, ${text.length} Zeichen]` : text;

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  euro: "€",
};

/** The visible text of a mail's HTML, without a DOM: blocks become lines, scripts and styles go. */
export const htmlToText = (html: string): string =>
  html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (entity, name: string) => ENTITIES[name] ?? entity)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** The mail's text: its text parts, else its HTML as text. */
export const bodyText = (email: Pick<EmailDetail, "textBody" | "htmlBody" | "bodyValues">) => {
  const values = (parts: EmailDetail["textBody"]) =>
    parts.map((part) => (part.partId ? (email.bodyValues[part.partId]?.value ?? "") : ""));
  const text = values(email.textBody).join("\n").trim();
  if (text) return text;
  return htmlToText(values(email.htmlBody).join("\n"));
};

export type AccountNames = Record<string, string>;

export const mailSummary = (email: EmailSummary, accountId: string, names: AccountNames) => ({
  accountId,
  account: names[accountId] ?? accountId,
  id: email.id,
  threadId: email.threadId,
  received: localTime(email.receivedAt),
  from: addresses(email.from),
  to: addresses(email.to),
  subject: email.subject ?? "",
  preview: email.preview,
  unread: !email.keywords.$seen,
  flagged: Boolean(email.keywords.$flagged),
  hasAttachment: email.hasAttachment,
});

export type MailSummary = ReturnType<typeof mailSummary>;

export const mailDetail = (
  email: EmailDetail,
  accountId: string,
  names: AccountNames,
  folders: string[],
  maxChars: number,
) => ({
  ...mailSummary(email, accountId, names),
  folders,
  cc: addresses(email.cc),
  replyTo: addresses(email.replyTo),
  attachments: email.attachments.map((part) => ({
    name: part.name ?? "",
    type: part.type,
    size: part.size,
  })),
  body: clip(bodyText(email), maxChars),
});

/** Newest first, across accounts. */
export const newestFirst = <T extends { received: string }>(mails: T[]): T[] =>
  [...mails].sort((a, b) => b.received.localeCompare(a.received));

const values = <T>(record: Record<string, T> | undefined): T[] => Object.values(record ?? {});

export const contactEmails = (card: ContactCard): string[] =>
  values(card.emails).map((entry) => entry.address);

export const contactSummary = (card: ContactCard, accountId: string, names: AccountNames) => ({
  accountId,
  account: names[accountId] ?? accountId,
  id: card.id,
  name: fullName(card),
  company: company(card),
  emails: contactEmails(card),
  phones: values(card.phones).map((entry) => entry.number),
  addresses: values(card.addresses)
    .map(
      (entry) =>
        entry.full ??
        (entry.components ?? [])
          .map((part) => part.value)
          .join(" ")
          .trim(),
    )
    .filter(Boolean),
  note: clip(note(card), 1000),
});

export type ContactSummary = ReturnType<typeof contactSummary>;

const folded = (text: string): string => text.toLocaleLowerCase("de");

/** Whether a card is about this text: name, company, any address or number. Groups are left out. */
export const contactMatches = (card: ContactCard, query: string): boolean => {
  if (card.kind === "group") return false;
  const needle = folded(query.trim());
  if (!needle) return false;
  return [
    fullName(card),
    company(card),
    ...contactEmails(card),
    ...values(card.phones).map((entry) => entry.number),
  ].some((field) => folded(field).includes(needle));
};

export const eventSummary = (event: CalendarEvent, accountId: string, names: AccountNames) => {
  const { start, end, allDay } = eventTimes(event);
  return {
    accountId,
    account: names[accountId] ?? accountId,
    id: event.id,
    title: event.title ?? "",
    start: allDay ? localTime(start).slice(0, 10) : localTime(start),
    end: allDay ? localTime(new Date(end.getTime() - 1)).slice(0, 10) : localTime(end),
    allDay,
    location: locationName(event),
    participants: values(event.participants).map((participant) => ({
      name: participant.name ?? "",
      email: participantEmail(participant),
      status: participant.participationStatus ?? null,
    })),
    description: clip(event.description ?? "", 1000),
  };
};

export type EventSummary = ReturnType<typeof eventSummary>;

/** Whether an event concerns one of these addresses or mentions one of these terms. */
export const eventConcerns = (event: CalendarEvent, emails: string[], terms: string[]): boolean => {
  const wanted = new Set(emails.map(folded));
  if (values(event.participants).some((p) => wanted.has(folded(participantEmail(p))))) return true;
  const text = folded([event.title, event.description, locationName(event)].join(" "));
  return terms.some((term) => term.length > 2 && text.includes(folded(term)));
};

export const taskSummary = (task: Task, names: AccountNames) => ({
  id: task.id,
  accountId: task.accountId,
  board: names[task.accountId] ?? task.accountId,
  title: task.title,
  status: task.status,
  due: task.dueDate ? `${task.dueDate}${task.dueTime ? ` ${task.dueTime}` : ""}` : null,
  assignee: task.assigneeId ? (names[task.assigneeId] ?? task.assigneeId) : null,
  notes: clip(task.notes, 1000),
  checklist: task.checklist.length
    ? `${task.checklist.filter((item) => item.done).length}/${task.checklist.length} erledigt`
    : null,
  links: task.links.map(
    (link) => `${link.kind}: ${link.label}${link.detail ? ` (${link.detail})` : ""}`,
  ),
  completed: task.completedAt ? localTime(task.completedAt) : null,
});

export type TaskSummary = ReturnType<typeof taskSummary>;

/** Whether a task mentions one of these terms (title, notes, what it links to). */
export const taskConcerns = (task: Task, terms: string[]): boolean => {
  const text = folded(
    [task.title, task.notes, ...task.links.flatMap((link) => [link.label, link.detail])].join(" "),
  );
  return terms.some((term) => term.length > 2 && text.includes(folded(term)));
};
