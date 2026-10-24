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
};

export type Message = {
  id: string;
  channelId: string;
  authorId: string;
  text: string;
  mentions: string[];
  createdAt: string;
};

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

export const newMessageSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  mentions: z.array(person).max(50).default([]),
});

export const readSchema = z.object({ at: z.string().datetime() });
