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
  /**
   * End-to-end encrypted with the members' own keys (docs/encryption.md, building block 5): the
   * text of every message is an OpenPGP message only they can open.
   */
  confidential: boolean;
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

/**
 * A photo or file in a message; the app loads it from /api/chat/files/:id, a photo's small
 * picture (`thumb`) from /api/chat/files/:id?thumb=1.
 */
export type ChatFile = { id: string; name: string; type: string; size: number; thumb?: boolean };

/** A mail shared as a copy: its content as a chat file of this type, never shown as a file. */
export const MAIL_COPY_TYPE = "application/vnd.kontext.mail+json";

/** What a copied mail holds; the HTML is cleaned again where it is shown. */
export type MailCopy = {
  subject: string;
  from: string;
  to: string;
  cc: string;
  receivedAt: string;
  kind: "html" | "text";
  body: string;
};

/**
 * A mail, task or contact in a message, as a card. The label and detail are a snapshot taken when
 * it was shared, so whoever cannot open the mailbox still sees what it is about.
 */
/** document: a file in Dokumente (Schreibzeug), `ref` its id there; access is Schreibzeug's. */
export const CARD_KINDS = ["mail", "task", "contact", "document"] as const;
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
  /** A mail shared as a copy: the uploaded file with its content (MAIL_COPY_TYPE). */
  copyId: z.string().max(64).nullish(),
});
export type Card = z.infer<typeof cardSchema>;

/**
 * A call that ended, as a line in its conversation: who was in it and how long it ran. A direct
 * call nobody answered has no duration ("Verpasster Anruf").
 */
export type CallRecord = {
  video: boolean;
  /** A meeting in a channel rather than a call in a direct conversation. */
  meeting: boolean;
  /** Everyone who was in it at some point, the caller first. */
  participants: string[];
  /** Seconds from the answer (direct) or the start (meeting) to the end; null: not answered. */
  durationS: number | null;
};

/** The emojis of a message, each with who chose it, in the order they first came. */
export type Reaction = { emoji: string; members: string[] };

/** The answers to a message, as the channel shows them under it. */
export type Replies = { count: number; lastAt: string; people: string[] };

export type Message = {
  id: string;
  channelId: string;
  /** An answer in the thread of this message; null in the channel itself. */
  parentId: string | null;
  authorId: string;
  text: string;
  mentions: string[];
  files: ChatFile[];
  cards: Card[];
  createdAt: string;
  editedAt: string | null;
  /** Deleted by its author: it keeps its place, without content. */
  deleted: boolean;
  /** A call that ended in this conversation (written by the server, not by a person). */
  call: CallRecord | null;
  reactions: Reaction[];
  /** Of a message in the channel that has answers; null otherwise. */
  replies: Replies | null;
};

/** The text of a message in a confidential channel: encrypted, for the members only. */
export const isSealed = (text: string): boolean => text.startsWith("-----BEGIN PGP MESSAGE-----");

export const SEALED_SUMMARY = "Vertrauliche Nachricht";

/** What a message is about in one line: its text, else its card or file. */
export const messageSummary = (
  message: Pick<Message, "text" | "files" | "cards"> & { call?: CallRecord | null },
): string =>
  (isSealed(message.text) ? SEALED_SUMMARY : message.text) ||
  message.cards[0]?.label ||
  message.files[0]?.name ||
  (message.call ? callSummary(message.call) : "");

/** A call in one line, as the channel list and notifications show it. */
export const callSummary = (call: CallRecord): string =>
  call.durationS === null
    ? "Verpasster Anruf"
    : call.meeting
      ? "Besprechung"
      : call.video
        ? "Videoanruf"
        : "Anruf";

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
  confidential: z.boolean().default(false),
});

export const channelPatchSchema = z
  .object({ name: newChannelSchema.shape.name, members: newChannelSchema.shape.members })
  .partial();

export const newDirectSchema = z.object({
  members: z.array(person).min(1).max(8),
  confidential: z.boolean().default(false),
});

/**
 * A file encrypted in the app for a confidential channel: OpenPGP bytes the server cannot open;
 * its name and type travel inside the message's encrypted text.
 */
export const SEALED_FILE_TYPE = "application/vnd.kontext.sealed";

/** Binary OpenPGP data begins with a packet header, whose highest bit is set (RFC 9580 §4.2). */
export const looksSealed = (firstByte: number | undefined): boolean =>
  firstByte !== undefined && (firstByte & 0x80) !== 0;

/**
 * In a confidential channel: only encrypted text, no cards (they would be readable); files only
 * encrypted ones (`sealedFiles`: whether all of them are).
 */
export const fitsConfidential = (
  message: { text: string; cards?: unknown[]; fileIds?: string[] },
  sealedFiles = !message.fileIds?.length,
): boolean => isSealed(message.text) && !message.cards?.length && sealedFiles;

export const newMessageSchema = z
  .object({
    /** An answer in the thread of this message. */
    parentId: z.string().min(1).max(64).nullable().default(null),
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

/** One emoji (with skin tone or joined parts), on or off. */
export const reactionSchema = z.object({
  emoji: z
    .string()
    .min(1)
    .max(32)
    .regex(/^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\u200d|\ufe0f)+$/u)
    // Digits and "#" are emoji components too; one real picture is needed.
    .regex(/\p{Extended_Pictographic}/u),
  on: z.boolean(),
});

/** Adds or takes away one person's emoji, keeping the order the emojis first came in. */
export const toggleReaction = (
  reactions: Reaction[],
  emoji: string,
  member: string,
  on: boolean,
): Reaction[] => {
  const has = reactions.find((reaction) => reaction.emoji === emoji);
  if (on && !has) return [...reactions, { emoji, members: [member] }];
  return reactions
    .map((reaction) =>
      reaction.emoji !== emoji
        ? reaction
        : {
            emoji,
            members: on
              ? [...new Set([...reaction.members, member])]
              : reaction.members.filter((id) => id !== member),
          },
    )
    .filter((reaction) => reaction.members.length);
};

/** Text for the search: lower case as German writes it, so "Öl" finds "öl" and "ÖL". */
export const fold = (text: string): string => text.toLocaleLowerCase("de-DE");

/** How long messages stay, in days, as the Firmenverwaltung offers it; 0 is for ever. */
export const RETENTION_DAYS = [0, 30, 90, 180, 365, 730, 1825] as const;
export const retentionSchema = z.object({
  days: z
    .number()
    .int()
    .refine((days) => (RETENTION_DAYS as readonly number[]).includes(days)),
});

/** Messages from before this go; null: nothing goes. */
export const retentionCutoff = (days: number, now: Date): Date | null =>
  days > 0 ? new Date(now.getTime() - days * 86_400_000) : null;

/** Search words: at least two letters, so a search is not the whole history. */
export const searchSchema = z.string().trim().min(2).max(100);

/**
 * Who is told of a new message on their devices: in a direct conversation the others; elsewhere
 * the people it mentions and, for an answer, who wrote in the thread – if they belong there (for a mailbox channel: who has read in it, as
 * the server cannot see anyone else's access). Never the author, never who muted the channel.
 */
export const notifyWho = (
  channel: Pick<Channel, "kind" | "members">,
  message: Pick<Message, "authorId" | "mentions">,
  { readers, muted }: { readers: string[]; muted: string[] },
  /** For an answer: who wrote in its thread (the first message too), they hear of it. */
  thread: string[] = [],
): string[] => {
  const candidates = channel.kind === "direct" ? channel.members : [...message.mentions, ...thread];
  const belongs = (id: string) =>
    channel.kind === "team" ||
    (channel.kind === "mailbox" ? readers.includes(id) : channel.members.includes(id));
  return [...new Set(candidates)].filter(
    (id) => id !== message.authorId && belongs(id) && !muted.includes(id),
  );
};

/** A channel as the notification names it: "#baustelle-hoffmann", "info@". */
export const channelLabel = (
  channel: Pick<Channel, "kind" | "name" | "accountId">,
  accountName: (id: string) => string | undefined,
): string => {
  if (channel.kind === "mailbox") {
    return (accountName(channel.accountId ?? "") ?? "").replace(/@.*/, "@");
  }
  return channel.name ? `#${channel.name}` : "";
};

/** The notification for a message: who wrote, where, and what. */
export const chatNotice = (
  channel: Pick<Channel, "id" | "kind">,
  message: Pick<Message, "id" | "text" | "files" | "cards"> & { parentId?: string | null },
  author: string,
  where: string,
) => {
  const text = messageSummary(message);
  // An answer: its thread open beside the message it answers.
  const shown = message.parentId ?? message.id;
  const thread = message.parentId ? `&thread=${encodeURIComponent(message.parentId)}` : "";
  return {
    title: message.parentId
      ? `${author} antwortet${where && channel.kind !== "direct" ? ` in ${where}` : ""}`
      : channel.kind === "direct" || !where
        ? author
        : `${author} in ${where}`,
    body: text.length > 200 ? `${text.slice(0, 199)}…` : text,
    url: `/chat?channel=${encodeURIComponent(channel.id)}&message=${encodeURIComponent(shown)}${thread}`,
    tag: `chat-${channel.id}`,
  };
};
