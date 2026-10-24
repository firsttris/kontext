/**
 * Who is writing in which channel, as the live connection reports it. A report holds for a few
 * seconds (the writer repeats it every three); a message of theirs ends it at once.
 */
import { useSyncExternalStore } from "react";

const HOLD_MS = 6000;

let typing: Record<string, Record<string, number>> = {};
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

const set = (channelId: string, members: Record<string, number>) => {
  typing = { ...typing, [channelId]: members };
  emit();
};

export const startTyping = (channelId: string, memberId: string, now = Date.now()) => {
  set(channelId, { ...typing[channelId], [memberId]: now + HOLD_MS });
  setTimeout(() => {
    const until = typing[channelId]?.[memberId];
    if (until !== undefined && until <= Date.now()) stopTyping(channelId, memberId);
  }, HOLD_MS + 50);
};

export const stopTyping = (channelId: string, memberId: string) => {
  if (!typing[channelId]?.[memberId]) return;
  const { [memberId]: _gone, ...rest } = typing[channelId];
  set(channelId, rest);
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const NOBODY: Record<string, number> = {};

/** The people writing in the channel right now. */
export const useTyping = (channelId: string): string[] =>
  Object.keys(useSyncExternalStore(subscribe, () => typing[channelId] ?? NOBODY));
