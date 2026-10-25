/**
 * What the chat shares besides text: mails, tasks and contacts as cards (a snapshot of what they
 * are about), photos made smaller before sending, and a task made from a message. Pure.
 */
import type { EmailSummary } from "@/jmap/types";
import { m } from "@/paraglide/messages";
import {
  type Card,
  type ChatFile,
  INLINE_TYPES,
  MAX_FILE_BYTES,
  MAX_FILES,
  type Message,
  messageSummary,
} from "../../server/chat/chat";
import type { TaskLink } from "../../server/tasks/tasks";
import { displayName } from "./format";
import { type ContactCard, company, fullName, primaryEmail } from "./jscontact";

export { type Card, type ChatFile, MAX_FILE_BYTES, MAX_FILES, messageSummary };

const when = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export const mailCard = (accountId: string, email: EmailSummary): Card => ({
  kind: "mail",
  accountId,
  ref: email.id,
  threadId: email.threadId ?? null,
  party: email.from?.[0]?.email ?? "",
  label: email.subject || m.mail_no_subject(),
  detail: `${displayName(email.from?.[0])} · ${when(email.receivedAt)}`,
});

export const taskCard = (task: { id: string; accountId: string; title: string }): Card => ({
  kind: "task",
  accountId: task.accountId,
  ref: task.id,
  threadId: null,
  party: "",
  label: task.title,
  detail: "",
});

export const contactCard = (contact: ContactCard & { accountId: string }): Card => ({
  kind: "contact",
  accountId: contact.accountId,
  ref: contact.id,
  threadId: null,
  party: primaryEmail(contact),
  label: fullName(contact),
  detail: [company(contact), primaryEmail(contact)].filter(Boolean).join(" · "),
});

export const sameCard = (a: Card, b: Card) =>
  a.kind === b.kind && a.ref === b.ref && a.accountId === b.accountId;

/** Shown as a picture in the page (the server sends these inline). */
export const isPhoto = (type: string) => INLINE_TYPES.includes(type);

/** Photos from a phone camera are large; their longer side shrinks to this before sending. */
export const PHOTO_SIDE = 2048;
/** The small picture the conversation shows: sharp enough for a tile on a sharp screen. */
export const THUMB_SIDE = 640;

/** The size a picture gets so that neither side is longer than `max`; never larger. */
export const fitWithin = (width: number, height: number, max = PHOTO_SIDE) => {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

/** A task from a message: its first line as the title, linked back to the message. */
export const taskFromMessage = (
  message: Message,
  channelTitle: string,
): { title: string; link: TaskLink } => {
  const summary = messageSummary(message);
  const firstLine = summary.split("\n")[0]!.trim();
  const title = firstLine.length > 120 ? `${firstLine.slice(0, 119)}…` : firstLine;
  return {
    title,
    link: {
      kind: "chat",
      accountId: message.channelId,
      ref: message.id,
      threadId: null,
      label: summary.length > 140 ? `${summary.slice(0, 139)}…` : summary,
      detail: channelTitle,
    },
  };
};

/** The tasks made from this message. */
export const tasksOfMessage = <T extends { links: TaskLink[] }>(tasks: T[], messageId: string) =>
  tasks.filter((task) => task.links.some((link) => link.kind === "chat" && link.ref === messageId));
