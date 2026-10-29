/**
 * Emptying Spam or Papierkorb: what goes for good and what only leaves the folder. A mail can be
 * in several folders at once in JMAP (RFC 8621 §4.1.1, `mailboxIds`); destroying it would take
 * it from the others too, so such a mail only leaves this one. Pure.
 */
export type FolderMail = { id: string; mailboxIds: Record<string, boolean> };

export const emptyFolderPlan = (
  mails: FolderMail[],
  folderId: string,
): { destroy: string[]; unlink: string[] } => {
  const elsewhere = (mail: FolderMail) =>
    Object.entries(mail.mailboxIds).some(([id, on]) => on && id !== folderId);
  return {
    destroy: mails.filter((mail) => !elsewhere(mail)).map((mail) => mail.id),
    unlink: mails.filter(elsewhere).map((mail) => mail.id),
  };
};
