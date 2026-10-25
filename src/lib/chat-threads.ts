/**
 * Answers, reactions and how long the chat keeps messages, as the app shows them. Pure.
 */
import { m } from "@/paraglide/messages";
import type { Message, Reaction } from "../../server/chat/chat";

/** The emojis offered at once; any other comes from the keyboard's own picker. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏"] as const;

/**
 * The newest thing that happened in a channel's loaded messages: a message or an answer in a
 * thread – up to there the channel counts as read.
 */
export const newestActivity = (messages: Message[]): string | undefined =>
  messages
    .flatMap((message) => [message.createdAt, message.replies?.lastAt ?? ""])
    .reduce<string | undefined>((max, at) => (at && (!max || at > max) ? at : max), undefined);

/** Whether answers came in since `readUpTo` from someone else. */
export const hasNewReplies = (message: Message, me: string, readUpTo: string | null): boolean =>
  Boolean(
    message.replies &&
      readUpTo &&
      message.replies.lastAt > readUpTo &&
      message.replies.people.some((id) => id !== me),
  );

/** "Du und Max", "Anna, Max und 2 weitere" – who chose an emoji. */
export const reactionNames = (
  reaction: Reaction,
  me: string,
  nameOf: (id: string) => string,
): string => {
  const names = [
    ...(reaction.members.includes(me) ? [m.chat_you()] : []),
    ...reaction.members.filter((id) => id !== me).map(nameOf),
  ];
  if (names.length <= 3) {
    return names.length > 1
      ? m.chat_reaction_names({ names: names.slice(0, -1).join(", "), last: names.at(-1)! })
      : (names[0] ?? "");
  }
  return m.chat_reaction_more({ names: names.slice(0, 2).join(", "), count: names.length - 2 });
};

/** "30 Tage", "1 Jahr", "5 Jahre". */
export const retentionText = (days: number): string => {
  if (days >= 365 && days % 365 === 0) {
    return days === 365 ? m.chat_keep_year() : m.chat_keep_years({ count: days / 365 });
  }
  if (days >= 90 && days % 30 === 0) return m.chat_keep_months({ count: days / 30 });
  return m.chat_keep_days({ count: days });
};
