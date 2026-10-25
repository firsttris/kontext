/**
 * Files of Dokumente (Schreibzeug) where they belong in Kontext: as cards in the chat, as links of a
 * task and of an appointment, and who should be able to open them there. Pure.
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

/** The appointment's links that are documents go by this key, followed by the file's id. */
const DOCUMENT_KEY = "kontext-document-";

/** The documents among an appointment's links. */
export const documentsOfLinks = (links?: Record<string, EventLink> | null): LinkedDocument[] =>
  Object.entries(links ?? {}).flatMap(([key, link]) =>
    key.startsWith(DOCUMENT_KEY)
      ? [{ id: key.slice(DOCUMENT_KEY.length), name: link.title ?? link.href, href: link.href }]
      : [],
  );

/** The appointment's links with these documents; other links (from an invitation) stay. */
export const withDocuments = (
  links: Record<string, EventLink> | null | undefined,
  documents: LinkedDocument[],
): Record<string, EventLink> | null => {
  const others = Object.entries(links ?? {}).filter(([key]) => !key.startsWith(DOCUMENT_KEY));
  const all = [
    ...others,
    ...documents.map(({ id, name, href }): [string, EventLink] => [
      `${DOCUMENT_KEY}${id}`,
      { "@type": "Link", href, title: name },
    ]),
  ];
  return all.length ? Object.fromEntries(all) : null;
};

/** The addresses of people among the principals, by their account ids (or all of them). */
const addressesOf = (principals: Principal[], ids?: string[]): string[] =>
  principals.flatMap((principal) =>
    principal.type === "individual" && principal.email && (!ids || ids.includes(principal.id))
      ? [principal.email.toLowerCase()]
      : [],
  );

/**
 * Who reads a channel, by address: everyone in a team channel, the members of a named or direct
 * one. A shared mailbox's channel has no list of people here; its file is shared with nobody.
 */
export const channelReaders = (
  channel: Pick<Channel, "kind" | "members">,
  principals: Principal[],
): string[] => {
  if (channel.kind === "team") return addressesOf(principals);
  if (channel.kind === "mailbox") return [];
  return addressesOf(principals, channel.members);
};

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
