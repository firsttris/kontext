/** The parts of the JMAP data model (RFC 8621, JSContact, JSCalendar) that the app reads. */

export type EmailAddress = { name: string | null; email: string };

export type Mailbox = {
  id: string;
  name: string;
  parentId: string | null;
  role: string | null;
  sortOrder: number;
  totalEmails: number;
  unreadEmails: number;
  /** RFC 8621 §2: what the user may do here; less in a mailbox shared only for reading. */
  myRights?: {
    mayReadItems?: boolean;
    mayAddItems?: boolean;
    mayRemoveItems?: boolean;
    maySetSeen?: boolean;
    maySetKeywords?: boolean;
    mayCreateChild?: boolean;
    mayRename?: boolean;
    mayDelete?: boolean;
    maySubmit?: boolean;
  };
};

export type EmailSummary = {
  id: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;
  from: EmailAddress[] | null;
  to: EmailAddress[] | null;
  subject: string | null;
  receivedAt: string;
  preview: string;
  hasAttachment: boolean;
  size: number;
  /** The raw Content-Type, where loaded: an encrypted mail in the list. */
  "header:Content-Type"?: string | null;
};

export type BodyPart = {
  partId: string | null;
  blobId: string | null;
  type: string;
  name: string | null;
  size: number;
  cid: string | null;
  disposition: string | null;
};

export type EmailDetail = EmailSummary & {
  cc: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
  replyTo: EmailAddress[] | null;
  sentAt: string | null;
  messageId: string[] | null;
  references: string[] | null;
  inReplyTo: string[] | null;
  htmlBody: BodyPart[];
  textBody: BodyPart[];
  attachments: BodyPart[];
  bodyValues: Record<string, { value: string; isTruncated?: boolean }>;
  /** Headers the mail server adds on arrival, topmost first (src/lib/sender-check.ts). */
  authenticationResults: string[] | null;
  spamScore: string[] | null;
  /** The whole message as sent, to read an encrypted or signed one. */
  blobId: string;
  /** The raw Content-Type: multipart/encrypted or multipart/signed for PGP/MIME. */
  contentType: string | null;
  /** The sender's key, if sent along (Autocrypt). */
  autocrypt: string | null;
  /** The Received lines, topmost first: whether it came encrypted. */
  received: string[] | null;
  /** Who asks for a read receipt (Disposition-Notification-To), if anyone. */
  receiptTo: EmailAddress[] | null;
  /** The newsletter's ways to unsubscribe (List-Unsubscribe), and whether one click does it. */
  unsubscribe: string[] | null;
  unsubscribePost: string | null;
};

export type Identity = {
  id: string;
  name: string;
  email: string;
  replyTo: EmailAddress[] | null;
  bcc: EmailAddress[] | null;
  textSignature: string;
  htmlSignature: string;
};

export type Account = { id: string; name: string; isPersonal: boolean; isReadOnly: boolean };
