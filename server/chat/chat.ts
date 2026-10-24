/**
 * Team chat: channels and messages as the app and the server exchange them, and who may see a
 * channel. People are named by their personal account id (in Stalwart also their principal id).
 * Pure.
 */
import { z } from "zod";

/**
 * - team: #allgemein, everyone of the company;
 * - mailbox: one per shared mailbox (info@), for whoever can open that mailbox;
 * - channel: a named channel with chosen members;
 * - direct: a conversation of two or a few people.
 */
export const CHANNEL_KINDS = ["team", "mailbox", "channel", "direct"] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

export type Channel = {
  id: string;
  kind: ChannelKind;
  /** The name of a team or named channel ("allgemein"); null for mailbox and direct ones. */
  name: string | null;
  /** The shared mailbox of a mailbox channel. */
  accountId: string | null;
  /** The members of a named or direct channel; empty for team and mailbox channels. */
  members: string[];
  createdBy: string;
  createdAt: string;
  lastMessageAt: string | null;
};

/** A channel as one person sees it in the list. */
export type ChannelSummary = Channel & {
  unread: number;
  mentions: number;
  /** When this person last read it (ISO), or null. */
  readAt: string | null;
  last: { authorId: string; text: string } | null;
  /** Muted by this person: no unread count on the app, no notification. */
  muted: boolean;
};

/** A photo or file in a message; the app loads it from /api/chat/files/:id. */
export type ChatFile = { id: string; name: string; type: string; size: number };

/**
 * A mail, task or contact in a message, as a card. The label and detail are a snapshot taken when
 * it was shared, so whoever cannot open the mailbox still sees what it is about.
 */
export const CARD_KINDS = ["mail", "task", "contact"] as const;
export const cardSchema = z.object({
  kind: z.enum(CARD_KINDS),
  /** The account it lives in (mailbox, task board, address book's account). */
  accountId: z.string().min(1).max(64),
  ref: z.string().min(1).max(200),
  /** A mail's thread, so every mail of the conversation knows it was discussed. */
  threadId: z.string().max(200).nullable().default(null),
  /** For a mail: the sender's address, to suggest the channel next time. */
  party: z.string().max(300).default(""),
  /** Subject, task title or name. */
  label: z.string().max(300),
  /** Sender and time, due date, company … */
  detail: z.string().max(300).default(""),
});
export type Card = z.infer<typeof cardSchema>;

export type Message = {
  id: string;
  channelId: string;
  authorId: string;
  text: string;
  mentions: string[];
  files: ChatFile[];
  cards: Card[];
  createdAt: string;
  editedAt: string | null;
  /** Deleted by its author: it keeps its place, without content. */
  deleted: boolean;
};

/** What a message is about in one line: its text, else its card or file. */
export const messageSummary = (message: Pick<Message, "text" | "files" | "cards">): string =>
  message.text || message.cards[0]?.label || message.files[0]?.name || "";

/** Per file; photos are made smaller in the app before they are sent. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES = 10;
/** Shown in the page; everything else is downloaded (no HTML or SVG from the same origin). */
export const INLINE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

/** Who is asking: their personal account and every account their JMAP session opens. */
export type Viewer = { me: string; accountIds: string[] };

export const canSee = (
  channel: Pick<Channel, "kind" | "accountId" | "members">,
  viewer: Viewer,
) => {
  if (channel.kind === "team") return true;
  if (channel.kind === "mailbox") return viewer.accountIds.includes(channel.accountId ?? "");
  return channel.members.includes(viewer.me);
};

/** "Baustelle Hoffmann" → "baustelle-hoffmann": lower case, dashes, no "#". */
export const channelName = (input: string): string =>
  input
    .trim()
    .replace(/^#+/, "")
    .toLocaleLowerCase("de-DE")
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

/** The key of a direct conversation: the same people always find the same one. */
export const directKey = (members: string[]): string => [...new Set(members)].sort().join(",");

const person = z.string().min(1).max(64);

export const newChannelSchema = z.object({
  name: z.string().max(80).transform(channelName).pipe(z.string().min(1).max(60)),
  members: z.array(person).max(200),
});

export const channelPatchSchema = z
  .object({ name: newChannelSchema.shape.name, members: newChannelSchema.shape.members })
  .partial();

export const newDirectSchema = z.object({ members: z.array(person).min(1).max(8) });

export const newMessageSchema = z
  .object({
    text: z.string().trim().max(4000).default(""),
    mentions: z.array(person).max(50).default([]),
    fileIds: z.array(z.string().min(1).max(64)).max(MAX_FILES).default([]),
    cards: z.array(cardSchema).max(5).default([]),
  })
  .refine((message) => message.text || message.fileIds.length || message.cards.length);
export type NewMessage = z.input<typeof newMessageSchema>;

export const readSchema = z.object({ at: z.string().datetime() });

export const editMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  mentions: z.array(person).max(50).default([]),
});

export const muteSchema = z.object({ muted: z.boolean() });

/** Search words: at least two letters, so a search is not the whole history. */
export const searchSchema = z.string().trim().min(2).max(100);
