/**
 * The real subjects of encrypted mails (Protected Headers, src/lib/mime.ts): outside they say
 * "Vertrauliche Nachricht"; once a mail is opened here, list, view and answer show the real one.
 * In memory only, like the unlocked key.
 */
import { useSyncExternalStore } from "react";

const subjects = new Map<string, string>();
const listeners = new Set<() => void>();

export const revealSubject = (emailId: string, subject: string | null) => {
  if (!subject || subjects.get(emailId) === subject) return;
  subjects.set(emailId, subject);
  for (const listener of listeners) listener();
};

/** For a mail not on screen (an answer): the real subject where known. */
export const shownSubject = (email: { id: string; subject: string | null }) =>
  subjects.get(email.id) ?? email.subject;

export const useShownSubject = (email: { id: string; subject: string | null }) =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => subjects.get(email.id),
  ) ?? email.subject;
