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
