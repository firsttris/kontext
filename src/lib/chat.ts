/**
 * The team chat as the app shows it: channel titles and order, messages grouped by day and by
 * author, text with links and @mentions, the @ suggestions while writing, and who has read a
 * message. Pure; what a channel and a message are: server/chat/chat.ts.
 */
import { m } from "@/paraglide/messages";
import type { Channel, ChannelSummary, Message } from "../../server/chat/chat";
import { dateKey } from "./jscalendar";
import { shortAddress } from "./mail-accounts";

export { channelName } from "../../server/chat/chat";
export type { Channel, ChannelSummary, Message };

export type Person = { id: string; name: string };

/** "Sandra Klein" → "Sandra". */
export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

/**
 * How a channel is called: its name, the mailbox for a mailbox channel, the other people for a
 * direct one (one: the full name; several: first names).
 */
export const channelTitle = (
  channel: Pick<Channel, "kind" | "name" | "accountId" | "members">,
  me: string,
  nameOf: (id: string) => string,
  accountName: (id: string) => string,
): string => {
  if (channel.kind === "mailbox") return shortAddress(accountName(channel.accountId ?? ""));
  if (channel.kind !== "direct") return channel.name ?? "";
  const others = channel.members.filter((member) => member !== me);
  if (others.length === 0) return nameOf(me);
  if (others.length === 1) return nameOf(others[0]!);
  return others.map((id) => firstName(nameOf(id))).join(", ");
};

const KIND_ORDER = { team: 0, mailbox: 1, channel: 2, direct: 3 } as const;

/** The channels of the sidebar: #allgemein, the mailboxes, the named ones by name. */
export const sortChannels = <T extends Channel>(channels: T[], title: (c: T) => string): T[] =>
  channels
    .filter((channel) => channel.kind !== "direct")
    .sort(
      (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || title(a).localeCompare(title(b), "de"),
    );

/** The direct conversations, the latest first. */
export const sortDirect = <T extends Channel>(channels: T[]): T[] =>
  channels
    .filter((channel) => channel.kind === "direct")
    .sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));

export const totalUnread = (channels: Pick<ChannelSummary, "unread">[]): number =>
  channels.reduce((sum, channel) => sum + channel.unread, 0);

/** Several messages of one person close together show under one name. */
const RUN_MINUTES = 5;

export type MessageRun = { authorId: string; createdAt: string; messages: Message[] };
export type TimelineItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "new"; key: string }
  | ({ kind: "run" } & MessageRun);

export const dayLabel = (day: string, today: string, yesterday: string): string => {
  if (day === today) return m.chat_today();
  if (day === yesterday) return m.chat_yesterday();
  return new Date(`${day}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

/**
 * Oldest first: a line per day, runs of one person's messages, and a line where the messages
 * of others begin that came after `readUpTo` (none when the channel was never read).
 */
export const timeline = (
  messages: Message[],
  now: Date,
  unread?: { me: string; readUpTo: string | null },
): TimelineItem[] => {
  const today = dateKey(now);
  const yesterday = dateKey(new Date(now.getTime() - 86_400_000));
  const items: TimelineItem[] = [];
  let day = "";
  let run: ({ kind: "run" } & MessageRun) | null = null;
  let newShown = !unread?.readUpTo;
  for (const message of messages) {
    const at = new Date(message.createdAt);
    const key = dateKey(at);
    if (key !== day) {
      day = key;
      run = null;
      items.push({ kind: "day", key, label: dayLabel(key, today, yesterday) });
    }
    if (
      !newShown &&
      message.authorId !== unread?.me &&
      at.getTime() > Date.parse(unread?.readUpTo ?? "")
    ) {
      newShown = true;
      run = null;
      items.push({ kind: "new", key: `new-${message.id}` });
    }
    const last = run?.messages.at(-1);
    if (
      run &&
      last &&
      run.authorId === message.authorId &&
      at.getTime() - Date.parse(last.createdAt) <= RUN_MINUTES * 60_000
    ) {
      run.messages.push(message);
      continue;
    }
    run = {
      kind: "run",
      authorId: message.authorId,
      createdAt: message.createdAt,
      messages: [message],
    };
    items.push(run);
  }
  return items;
};

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "mention"; text: string; id: string };

const URL_PATTERN = /https?:\/\/[^\s<>"]+/g;
/** Punctuation that ends a sentence, not the link. */
const TRAILING = /[.,;:!?)\]]+$/;

const links = (text: string): Segment[] => {
  const parts: Segment[] = [];
  let index = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const href = match[0].replace(TRAILING, "");
    const start = match.index ?? 0;
    if (start > index) parts.push({ kind: "text", text: text.slice(index, start) });
    parts.push({ kind: "link", text: href, href });
    index = start + href.length;
  }
  if (index < text.length) parts.push({ kind: "text", text: text.slice(index) });
  return parts;
};

/**
 * The text in parts: links, and "@Anna" or "@Anna Weber" for the people the message mentions
 * (names of people it does not mention stay plain text).
 */
export const segments = (text: string, mentioned: Person[]): Segment[] => {
  const names = mentioned
    .flatMap((person) => [
      { id: person.id, token: `@${person.name}` },
      { id: person.id, token: `@${firstName(person.name)}` },
    ])
    // The longest first, so "@Anna Weber" is not cut to "@Anna".
    .sort((a, b) => b.token.length - a.token.length);
  const parts: Segment[] = [];
  let rest = text;
  while (rest) {
    let found: { at: number; id: string; token: string } | null = null;
    for (const name of names) {
      const at = rest.indexOf(name.token);
      if (at >= 0 && (!found || at < found.at)) found = { at, ...name };
    }
    if (!found) {
      parts.push(...links(rest));
      break;
    }
    if (found.at > 0) parts.push(...links(rest.slice(0, found.at)));
    parts.push({ kind: "mention", text: found.token, id: found.id });
    rest = rest.slice(found.at + found.token.length);
  }
  return parts;
};

/** What is being typed after an "@" just before the cursor, or null when no mention is. */
export const mentionQuery = (text: string, caret: number): string | null => {
  const match = /(?:^|\s)@([\p{L}\p{N}.-]*)$/u.exec(text.slice(0, caret));
  return match ? (match[1] ?? "") : null;
};

/** The people whose name starts with the query (first or last name). */
export const mentionSuggestions = (people: Person[], query: string, me: string): Person[] => {
  const q = query.toLocaleLowerCase("de-DE");
  return people
    .filter((person) => person.id !== me)
    .filter((person) =>
      person.name
        .toLocaleLowerCase("de-DE")
        .split(/\s+/)
        .some((part) => part.startsWith(q)),
    )
    .slice(0, 6);
};

/** Puts "@Anna " in place of the "@an" before the cursor. */
export const insertMention = (
  text: string,
  caret: number,
  person: Person,
): { text: string; caret: number } => {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  const token = `@${firstName(person.name)} `;
  return { text: before.slice(0, at) + token + text.slice(caret), caret: at + token.length };
};

/** Of the mentions picked while writing, the ones still in the text. */
export const keptMentions = (text: string, picked: Person[]): string[] => [
  ...new Set(
    picked
      .filter(
        (person) => text.includes(`@${firstName(person.name)}`) || text.includes(`@${person.name}`),
      )
      .map((person) => person.id),
  ),
];

/** The others who have read up to this message. */
export const readBy = (
  message: Pick<Message, "createdAt" | "authorId">,
  reads: Record<string, string>,
): string[] =>
  Object.entries(reads)
    .filter(
      ([member, at]) =>
        member !== message.authorId && Date.parse(at) >= Date.parse(message.createdAt),
    )
    .map(([member]) => member);
