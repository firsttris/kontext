/**
 * Files of Dokumente (Schreibzeug) where they belong in Kontext: as cards in the chat, as links of a
 * task, an appointment and a contact, and who should be able to open them there. Pure.
 */
import type { Principal } from "@/jmap/principals";
import type { Card, Channel } from "../../server/chat/chat";

export type { Card };

import type { TaskLink } from "../../server/tasks/tasks";

/** The "account" of a document in cards and task links: Dokumente itself, the file's id is `ref`. */
export const DOCUMENTS_ACCOUNT = "documents";

export type DocumentFile = { id: string; name: string };

export const documentCard = (file: DocumentFile): Card => ({
  kind: "document",
  accountId: DOCUMENTS_ACCOUNT,
  ref: file.id,
  threadId: null,
  party: "",
  label: file.name,
  detail: "",
});

export const documentLink = (file: DocumentFile): TaskLink => ({
  kind: "document",
  accountId: DOCUMENTS_ACCOUNT,
  ref: file.id,
  threadId: null,
  label: file.name,
  detail: "",
});

/** Where Kontext opens a document: the module "Dokumente" (src/routes/_app/documents.$.tsx). */
export const documentPath = (id: string) => `/documents/edit/${encodeURIComponent(id)}`;

/** The same as an address for an appointment's links, which other calendar programs show too. */
export const documentHref = (origin: string, id: string) => `${origin}${documentPath(id)}`;

/** An appointment's link (JSCalendar Link, RFC 8984 §1.4.11), as far as Kontext reads it. */
export type EventLink = { "@type"?: "Link"; href: string; title?: string };

/** A document of an appointment: the file and the address its link has. */
export type LinkedDocument = DocumentFile & { href: string };

/** Links of appointments and contacts that are documents go by this key, then the file's id. */
const DOCUMENT_KEY = "kontext-document-";

/** Documents among links of any kind, read with how that kind names address and title. */
const documentsAmong = <L>(
  links: Record<string, L> | null | undefined,
  read: (link: L) => { href: string; title?: string },
): LinkedDocument[] =>
  Object.entries(links ?? {}).flatMap(([key, link]) => {
    if (!key.startsWith(DOCUMENT_KEY)) return [];
    const { href, title } = read(link);
    return [{ id: key.slice(DOCUMENT_KEY.length), name: title ?? href, href }];
  });

/** The links with exactly these documents; other links (from an invitation, a vCard) stay. */
const withDocumentsAmong = <L>(
  links: Record<string, L> | null | undefined,
  documents: LinkedDocument[],
  write: (document: LinkedDocument) => L,
): Record<string, L> | null => {
  const others = Object.entries(links ?? {}).filter(([key]) => !key.startsWith(DOCUMENT_KEY));
  const all = [
    ...others,
    ...documents.map((document): [string, L] => [`${DOCUMENT_KEY}${document.id}`, write(document)]),
  ];
  return all.length ? Object.fromEntries(all) : null;
};

/** The documents among an appointment's links. */
export const documentsOfLinks = (links?: Record<string, EventLink> | null): LinkedDocument[] =>
  documentsAmong(links, (link) => link);

/** The appointment's links with these documents. */
export const withDocuments = (
  links: Record<string, EventLink> | null | undefined,
  documents: LinkedDocument[],
): Record<string, EventLink> | null =>
  withDocumentsAmong(links, documents, ({ href, name }) => ({
    "@type": "Link",
    href,
    title: name,
  }));

/** A contact's link (JSContact Link, RFC 9553 §2.6.3), as far as Kontext reads it. */
export type ContactLink = { "@type"?: "Link"; uri: string; label?: string };

/** The documents among a contact's links. */
export const documentsOfContact = (links?: Record<string, ContactLink> | null): LinkedDocument[] =>
  documentsAmong(links, (link) => ({ href: link.uri, title: link.label }));

/** The contact's links with these documents. */
export const withContactDocuments = (
  links: Record<string, ContactLink> | null | undefined,
  documents: LinkedDocument[],
): Record<string, ContactLink> | null =>
  withDocumentsAmong(links, documents, ({ href, name }) => ({
    "@type": "Link",
    uri: href,
    label: name,
  }));

/** The addresses of people among the principals, by their account ids (or all of them). */
const addressesOf = (principals: Principal[], ids?: string[]): string[] =>
  principals.flatMap((principal) =>
    principal.type === "individual" && principal.email && (!ids || ids.includes(principal.id))
      ? [principal.email.toLowerCase()]
      : [],
  );

/**
 * Who reads a channel, by address: everyone in a team channel, the members of a named or direct
 * one. A shared mailbox's channel has no list of people here: channelMailboxes names it, and
 * Kontext's server knows its people.
 */
export const channelReaders = (
  channel: Pick<Channel, "kind" | "members">,
  principals: Principal[],
): string[] => {
  if (channel.kind === "team") return addressesOf(principals);
  if (channel.kind === "mailbox") return [];
  return addressesOf(principals, channel.members);
};

/** The shared mailbox whose people read a mailbox channel. */
export const channelMailboxes = (channel: Pick<Channel, "kind" | "accountId">): string[] =>
  channel.kind === "mailbox" && channel.accountId ? [channel.accountId] : [];

/** The people of a task: who it is assigned to. */
export const taskReaders = (assigneeId: string | null, principals: Principal[]): string[] =>
  assigneeId ? addressesOf(principals, [assigneeId]) : [];

/** The colleagues among an appointment's attendees (outside people cannot sign in to Dokumente). */
export const eventReaders = (attendees: string[], principals: Principal[]): string[] => {
  const company = new Set(addressesOf(principals));
  return attendees
    .map((address) => address.toLowerCase())
    .filter((address) => company.has(address));
};
