/**
 * Encrypted mails as opened here (PGP, S/MIME): their real subject (Protected Headers,
 * src/lib/mime.ts; outside they say "Vertrauliche Nachricht") and content. List, conversation,
 * view, answer and forward use them once a mail was opened. In memory only, like the unlocked
 * key: gone on reload.
 */
import { useSyncExternalStore } from "react";
import type { MimeAttachment } from "@/lib/mime";

export type OpenedMail = {
  subject: string | null;
  text: string;
  html: string | null;
  attachments: MimeAttachment[];
};

const opened = new Map<string, OpenedMail>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const rememberOpened = (emailId: string, mail: OpenedMail) => {
  if (opened.get(emailId) === mail) return;
  opened.set(emailId, mail);
  for (const listener of listeners) listener();
};

/** For a mail not on screen (an answer, forwarding): what is known of it. */
export const openedMail = (emailId: string): OpenedMail | undefined => opened.get(emailId);

/** For a mail not on screen: the real subject where known. */
export const shownSubject = (email: { id: string; subject: string | null }) =>
  opened.get(email.id)?.subject ?? email.subject;

export const useShownSubject = (email: { id: string; subject: string | null }) =>
  useSyncExternalStore(subscribe, () => opened.get(email.id)?.subject) ?? email.subject;

/** The start of the opened text, for lists; undefined while it was not opened here. */
export const useOpenedPreview = (emailId: string): string | undefined =>
  useSyncExternalStore(subscribe, () => opened.get(emailId)?.text)
    ?.replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
