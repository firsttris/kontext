/**
 * The demo's data: the "Weber Haustechnik" of the seed (dev/seed-data.ts) as JMAP objects, held in
 * the browser. Built fresh on every page load, so a reload starts the demo over. The objects are
 * shaped as Stalwart returns them (RFC 8621 §2, §4); only the properties the app reads are filled.
 */
import { DEV_DOMAIN } from "../../dev/config";
import { folders, groups, mails, type SeedMail, users } from "../../dev/seed-data";
import type { Category } from "../../server/categories/categories";
import type { Submission } from "./sending";

export type DemoAccount = {
  id: string;
  email: string;
  /** "Jonas Weber"; a shared mailbox's description ("Allgemeine Anfragen"). */
  fullName: string;
  isGroup: boolean;
  /** Accounts a person sees besides their own: the groups they belong to. */
  groups: string[];
  companyAdmin: boolean;
};

export type StoredMailbox = {
  id: string;
  accountId: string;
  name: string;
  parentId: string | null;
  role: string | null;
  sortOrder: number;
};

export type Part = {
  partId: string | null;
  blobId: string | null;
  type: string;
  name: string | null;
  size: number;
  cid: string | null;
  disposition: string | null;
  subParts: Part[] | null;
};

/** An Email (RFC 8621 §4.1) with every property the app asks for, keyed as JMAP names them. */
export type StoredEmail = Record<string, unknown> & {
  id: string;
  accountId: string;
  threadId: string;
  mailboxIds: Record<string, boolean>;
  keywords: Record<string, boolean>;
  receivedAt: string;
  messageId: string[] | null;
};

/** A calendar or an address book (draft-ietf-jmap-calendars, draft-ietf-jmap-contacts). */
export type StoredCollection = Record<string, unknown> & {
  id: string;
  accountId: string;
  name: string;
  isDefault: boolean;
};

/** A JSCalendar event or a JSContact card, as stored. */
export type StoredObject = Record<string, unknown> & { id: string; accountId: string };

export type Store = {
  /** The account of whoever is signed in; nobody at the start. */
  user: string | null;
  accounts: DemoAccount[];
  mailboxes: Map<string, StoredMailbox>;
  emails: Map<string, StoredEmail>;
  blobs: Map<string, Blob>;
  calendars: Map<string, StoredCollection>;
  addressBooks: Map<string, StoredCollection>;
  /** Series as stored: their dates are expanded when asked for (src/demo/events.ts). */
  events: Map<string, StoredObject>;
  cards: Map<string, StoredObject>;
  /** Mails sent or held (EmailSubmission). */
  submissions: Map<string, Submission>;
  /** Mail categories an account changed; the others have the defaults. */
  categories: Map<string, Category[]>;
  /** Senders whose pictures from the internet load at once. */
  imageSenders: string[];
  /** One state for everything; it counts the changes (RFC 8620 §1.2 `state`). */
  state: number;
  nextId: number;
};

/** The standard folders Stalwart creates for every account, as it names them. */
const STANDARD_FOLDERS: [string, string][] = [
  ["inbox", "Inbox"],
  ["drafts", "Drafts"],
  ["sent", "Sent Items"],
  ["junk", "Junk Mail"],
  ["trash", "Deleted Items"],
];

const ROLE_BY_FOLDER: Record<string, string> = { Archiv: "archive" };

export const newId = (store: Store, prefix: string): string => `${prefix}${store.nextId++}`;

const accountsOfSeed = (): DemoAccount[] => [
  ...users.map((user) => ({
    id: user.name,
    email: `${user.name}@${DEV_DOMAIN}`,
    fullName: user.fullName,
    isGroup: false,
    groups: user.groups,
    companyAdmin: user.companyAdmin ?? false,
  })),
  ...groups.map((group) => ({
    id: group.name,
    email: `${group.name}@${DEV_DOMAIN}`,
    fullName: group.description,
    isGroup: true,
    groups: [],
    companyAdmin: false,
  })),
];

/**
 * A seed folder's id: its path without "/", as Stalwart's ids have none – the app writes patches
 * as `mailboxIds/<id>` (src/jmap/mail.ts) without escaping a "/" (RFC 6901).
 */
const seedFolderId = (owner: string, path: string) => `${owner}-${path.replaceAll("/", "-")}`;

/** Every account's standard folders, then the seed's own ("Kunden/Hoffmann" under "Kunden"). */
const mailboxesOfSeed = (accounts: DemoAccount[]): StoredMailbox[] =>
  accounts.flatMap((account) => {
    const standard = STANDARD_FOLDERS.map(([role, name], index) => ({
      id: `${account.id}-${role}`,
      accountId: account.id,
      name,
      parentId: null,
      role,
      sortOrder: index,
    }));
    const own = (folders[account.id] ?? []).map((path) => {
      const parts = path.split("/");
      const parent = parts.slice(0, -1).join("/");
      return {
        id: seedFolderId(account.id, path),
        accountId: account.id,
        name: parts.at(-1)!,
        parentId: parent ? seedFolderId(account.id, parent) : null,
        role: ROLE_BY_FOLDER[path] ?? null,
        sortOrder: 10,
      };
    });
    return [...standard, ...own];
  });

const folderId = (owner: string, folder: string) =>
  folder === "Posteingang" ? `${owner}-inbox` : seedFolderId(owner, folder);

const address = ([name, email]: [string, string]) => ({ name, email });

/** The start of the text, as Stalwart's `preview` (up to 256 characters, whitespace folded). */
export const previewOf = (text: string): string => text.replace(/\s+/g, " ").trim().slice(0, 256);

const textPart = (partId: string, type: string, value: string): Part => ({
  partId,
  blobId: null,
  type,
  name: null,
  size: new TextEncoder().encode(value).length,
  cid: null,
  disposition: null,
  subParts: null,
});

/** The parts of a seed mail: text, HTML as its alternative, the attachment after both. */
const structureOf = (mail: SeedMail, attachmentBlobId: string | null) => {
  const text = textPart("1", "text/plain", mail.body);
  const html = mail.html ? textPart("2", "text/html", mail.html) : null;
  const attachment: Part | null =
    mail.attachment && attachmentBlobId
      ? {
          partId: "3",
          blobId: attachmentBlobId,
          type: mail.attachment.type,
          name: mail.attachment.name,
          size: new Blob([mail.attachment.content as BlobPart]).size,
          cid: null,
          disposition: "attachment",
          subParts: null,
        }
      : null;
  const body = html
    ? { ...textPart("", "multipart/alternative", ""), partId: null, subParts: [text, html] }
    : text;
  const bodyStructure = attachment
    ? { ...textPart("", "multipart/mixed", ""), partId: null, subParts: [body, attachment] }
    : body;
  return {
    bodyStructure,
    textBody: [text],
    htmlBody: [html ?? text],
    attachments: attachment ? [attachment] : [],
    bodyValues: {
      "1": { value: mail.body, isTruncated: false },
      ...(mail.html ? { "2": { value: mail.html, isTruncated: false } } : {}),
    },
  };
};

/** What the receiving server writes on arrival, so the sender check has something to show. */
const arrivalHeaders = (from: string) => {
  const domain = from.split("@")[1];
  return {
    "header:Authentication-Results:asText:all": [
      `mx.${DEV_DOMAIN}; dkim=pass header.d=${domain}; spf=pass smtp.mailfrom=${from}; dmarc=pass header.from=${domain}`,
    ],
    "header:Received:all": [`from mail.${domain} by mx.${DEV_DOMAIN} with ESMTPS`],
  };
};

/** The headers no seed mail has; the app asks for them all. */
export const EMPTY_HEADERS = {
  "header:Content-Type": null,
  "header:X-Spam-Score:asText:all": null,
  "header:Autocrypt:asText": null,
  "header:Disposition-Notification-To:asAddresses": null,
  "header:List-Unsubscribe:asURLs": null,
  "header:List-Unsubscribe-Post:asText": null,
  "header:Authentication-Results:asText:all": null,
  "header:Received:all": null,
};

const emailOfSeed = (mail: SeedMail, index: number, now: number, store: Store): StoredEmail => {
  const receivedAt = new Date(now - mail.hoursAgo * 3_600_000).toISOString();
  const attachmentBlobId = mail.attachment ? `blob-seed-${index}` : null;
  if (mail.attachment && attachmentBlobId) {
    store.blobs.set(
      attachmentBlobId,
      new Blob([mail.attachment.content as BlobPart], { type: mail.attachment.type }),
    );
  }
  const parts = structureOf(mail, attachmentBlobId);
  const size = mail.body.length + (mail.html?.length ?? 0) + (parts.attachments[0]?.size ?? 0);
  const internal = mail.from[1].endsWith(`@${DEV_DOMAIN}`);
  return {
    ...EMPTY_HEADERS,
    ...(internal ? {} : arrivalHeaders(mail.from[1])),
    id: `seed-${index}`,
    accountId: mail.owner,
    blobId: `blob-message-${index}`,
    threadId: `thread-seed-${index}`,
    mailboxIds: { [folderId(mail.owner, mail.folder)]: true },
    keywords: {
      ...(mail.seen ? { $seen: true } : {}),
      ...(mail.flagged ? { $flagged: true } : {}),
      ...Object.fromEntries((mail.categories ?? []).map((keyword) => [keyword, true])),
    },
    from: [address(mail.from)],
    to: mail.to.map(address),
    cc: mail.cc?.map(address) ?? null,
    bcc: null,
    replyTo: null,
    subject: mail.subject,
    receivedAt,
    sentAt: receivedAt,
    preview: previewOf(mail.body),
    hasAttachment: Boolean(mail.attachment),
    size,
    messageId: [mail.id],
    inReplyTo: mail.inReplyTo ? [mail.inReplyTo] : null,
    references: mail.inReplyTo ? [mail.inReplyTo] : null,
    ...parts,
  };
};

/** The seed's mails without the one full of XSS tricks: it is there for the tests. */
const demoMails = mails.filter((mail) => !mail.subject.includes("XSS-Test"));

/** The demo as the seed leaves a fresh Stalwart; the visitor picks who to be. */
export const createStore = (now = Date.now()): Store => {
  const accounts = accountsOfSeed();
  const store: Store = {
    user: null,
    accounts,
    mailboxes: new Map(mailboxesOfSeed(accounts).map((mailbox) => [mailbox.id, mailbox])),
    emails: new Map(),
    blobs: new Map(),
    calendars: new Map(),
    addressBooks: new Map(),
    events: new Map(),
    cards: new Map(),
    submissions: new Map(),
    categories: new Map(),
    imageSenders: [],
    state: 1,
    nextId: 1,
  };
  demoMails.forEach((mail, index) => {
    const email = emailOfSeed(mail, index, now, store);
    store.emails.set(email.id, email);
  });
  return store;
};

/** The accounts the signed-in person sees: their own first, then their groups. */
export const visibleAccounts = (store: Store): DemoAccount[] => {
  const own = store.accounts.find((account) => account.id === store.user);
  return own ? [own, ...store.accounts.filter((account) => own.groups.includes(account.id))] : [];
};

export const accountOf = (store: Store, id: string): DemoAccount | undefined =>
  store.accounts.find((account) => account.id === id);
