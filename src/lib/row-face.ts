/**
 * Whom a line of the mail list shows a picture of: the first recipient in a list that names the
 * recipients (Sent, Drafts), else the sender – of a conversation shown as one line, its latest
 * mail's. Pure; the picture itself comes from features/photos (`usePhotoOf`).
 */
import type { EmailSummary } from "@/jmap/types";
import { displayName } from "./format";
import { mailSenderKey, type PhotoKey } from "./photo";

type FaceMail = Pick<EmailSummary, "from" | "to" | "header:Authentication-Results:asText:all">;

export type RowFace = { name: string; photo: PhotoKey };

export const rowFace = (
  email: FaceMail,
  { showRecipient, latest }: { showRecipient: boolean; latest?: FaceMail },
): RowFace => {
  if (showRecipient) {
    // One's own mail: whom it went to is what one wrote, no one else's claim to check.
    const recipient = email.to?.[0];
    return {
      name: displayName(recipient),
      photo: recipient?.email ? { email: recipient.email } : {},
    };
  }
  const mail = latest ?? email;
  const sender = mail.from?.[0];
  return {
    name: displayName(sender),
    // As the reading pane: a sender the check did not confirm gets no one's photo.
    photo: mailSenderKey(sender, mail["header:Authentication-Results:asText:all"]),
  };
};
