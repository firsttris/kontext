/**
 * The chat in memory: channels, messages and files as the SQLite stores keep them (store.ts,
 * messages.ts, files.ts), without a database. For the route tests and for the demo, which runs
 * the chat's routes in the browser (src/demo). File contents are kept as blobs under their path.
 */
import {
  type Channel,
  type ChatFile,
  canSee,
  directKey,
  fold,
  type Message,
  messageSummary,
  toggleReaction,
} from "./chat";
import type { ChatFiles, StoredFile } from "./files";
import type { MessageStore } from "./messages";
import type { ChatStore } from "./store";

/** Without a read mark, only this much counts as unread (store.ts). */
const UNREAD_WITHOUT_MARK_MS = 7 * 86_400_000;

/** #allgemein has a fixed id (store.ts). */
const TEAM_ID = "team";

type Clock = () => Date;

const createFiles = () => {
  const stored: StoredFile[] = [];
  const blobs = new Map<string, Blob>();
  /** The channels whose files went with them. */
  const removedChannels: string[] = [];
  // A counter, not the number kept: removed files would give their ids out again.
  let count = 0;
  const removeWhere = (gone: (file: StoredFile) => boolean) => {
    for (const file of stored.filter(gone)) {
      blobs.delete(file.path);
      if (file.thumbPath) blobs.delete(file.thumbPath);
      stored.splice(stored.indexOf(file), 1);
    }
  };
  const files: ChatFiles = {
    save: async (channelId, _by, file, thumb, type = file.type) => {
      const id = `f${++count}`;
      const thumbPath = thumb ? `memory:${id}.thumb` : null;
      blobs.set(`memory:${id}`, file);
      if (thumb && thumbPath) blobs.set(thumbPath, thumb);
      const saved: ChatFile = {
        id,
        name: file.name,
        type,
        size: file.size,
        ...(thumb ? { thumb: true } : {}),
      };
      stored.push({ ...saved, channelId, messageId: null, path: `memory:${id}`, thumbPath });
      return saved;
    },
    get: async (id) => stored.find((file) => file.id === id) ?? null,
    attach: async (ids, message) => {
      const attached: ChatFile[] = [];
      for (const file of stored) {
        if (!ids.includes(file.id) || file.channelId !== message.channelId || file.messageId) {
          continue;
        }
        file.messageId = message.id;
        const { channelId: _, messageId: __, path: ___, thumbPath: ____, ...shown } = file;
        attached.push(shown);
      }
      return attached;
    },
    ofMessages: async () => new Map(),
    pruneUnsent: async () => 0,
    removeOfMessage: async (messageId) => removeWhere((file) => file.messageId === messageId),
    removeOfMessages: async (messageIds) =>
      removeWhere((file) => Boolean(file.messageId && messageIds.includes(file.messageId))),
    removeOfChannel: async (channelId) => {
      removeWhere((file) => file.channelId === channelId);
      removedChannels.push(channelId);
    },
  };
  return { files, stored, blobs, removedChannels };
};

const createMessages = (files: ChatFiles, now: Clock) => {
  const messages: Message[] = [];
  /** What the channel itself shows: its own messages and answers shown there too. */
  const inChannel = (m: Message) => !m.parentId || m.alsoInChannel;
  const withReplies = (message: Message): Message => {
    const answers = messages.filter((m) => m.parentId === message.id && !m.deleted);
    return answers.length && !message.parentId
      ? {
          ...message,
          replies: {
            count: answers.length,
            lastAt: answers.at(-1)!.createdAt,
            people: [...new Set(answers.map((m) => m.authorId))],
          },
        }
      : message;
  };
  const find = (id: string) => messages.find((m) => m.id === id);
  // Messages never share a millisecond, so "before" pages cleanly (messages.ts).
  let lastStamp = 0;
  const stamp = () => {
    lastStamp = Math.max(now().getTime(), lastStamp + 1);
    return new Date(lastStamp);
  };
  const store: MessageStore = {
    page: async (channelId, before, limit) =>
      messages
        .filter(
          (m) =>
            m.channelId === channelId &&
            inChannel(m) &&
            (!before || Date.parse(m.createdAt) < before.getTime()),
        )
        .reverse()
        .slice(0, limit)
        .map(withReplies),
    replies: async (parentId) => messages.filter((m) => m.parentId === parentId),
    threadPeople: async (parentId) => [
      ...new Set(
        messages.filter((m) => m.id === parentId || m.parentId === parentId).map((m) => m.authorId),
      ),
    ],
    react: async (id, memberId, emoji, on) => {
      const message = find(id)!;
      message.reactions = toggleReaction(message.reactions, emoji, memberId, on);
      return withReplies(message);
    },
    prune: async () => 0,
    post: async ({ fileIds, ...post }) => {
      const id = `m${messages.length + 1}`;
      const attached = await files.attach(fileIds, { id, ...post });
      const message: Message = {
        ...post,
        id,
        files: attached,
        createdAt: stamp().toISOString(),
        editedAt: null,
        deleted: false,
        parentId: post.parentId ?? null,
        alsoInChannel: Boolean(post.parentId && post.alsoInChannel),
        reactions: [],
        replies: null,
        call: post.call ?? null,
      };
      messages.push(message);
      return message;
    },
    last: async (channelIds) =>
      new Map(
        channelIds.flatMap((channelId) => {
          const last = messages.filter((m) => m.channelId === channelId && inChannel(m)).at(-1);
          return last ? [[channelId, { authorId: last.authorId, text: messageSummary(last) }]] : [];
        }),
      ),
    get: async (id) => {
      const message = find(id);
      return message ? withReplies(message) : null;
    },
    edit: async (id, text, mentions) => {
      const message = find(id)!;
      Object.assign(message, { text, mentions, editedAt: now().toISOString() });
      return withReplies(message);
    },
    remove: async (id) => {
      const message = find(id)!;
      Object.assign(message, {
        text: "",
        mentions: [],
        cards: [],
        files: [],
        reactions: [],
        call: null,
        deleted: true,
      });
      await files.removeOfMessage(id);
      return withReplies(message);
    },
    search: async (channelIds, words, limit) =>
      messages
        .filter(
          (m) =>
            channelIds.includes(m.channelId) &&
            !m.deleted &&
            fold(`${m.text} ${m.cards.map((card) => card.label).join(" ")}`).includes(fold(words)),
        )
        .reverse()
        .slice(0, limit),
    discussed: async (ref, threadId) =>
      messages
        .filter((m) =>
          m.cards.some(
            (card) =>
              card.kind === "mail" &&
              (card.ref === ref || (threadId !== null && card.threadId === threadId)),
          ),
        )
        .reverse()
        .map((m) => ({
          channelId: m.channelId,
          messageId: m.id,
          createdAt: m.createdAt,
          replies: messages.filter(
            (later) => later.channelId === m.channelId && later.createdAt > m.createdAt,
          ).length,
        })),
    channelsOfParty: async (party) => [
      ...new Set(
        messages
          .filter(
            (m) =>
              party && m.cards.some((card) => card.party.toLowerCase() === party.toLowerCase()),
          )
          .reverse()
          .map((m) => m.channelId),
      ),
    ],
  };
  return { store, messages };
};

const createChannels = (messages: Message[], now: Clock): ChatStore => {
  const channels: Channel[] = [];
  const reads: Record<string, Record<string, string>> = {};
  const muted = new Set<string>();
  let count = 0;
  const add = (channel: Omit<Channel, "createdAt" | "lastMessageAt">) => {
    const created = { ...channel, createdAt: now().toISOString(), lastMessageAt: null };
    channels.push(created);
    return created;
  };
  const nextId = () => `c${++count}`;
  /** People who join a channel have read it up to now. */
  const joined = (channelId: string, members: string[]) => {
    for (const member of members) {
      reads[channelId] = { [member]: now().toISOString(), ...reads[channelId] };
    }
  };
  /** #allgemein and one channel per shared mailbox exist from the first look on. */
  const ensureStandard = (sharedAccountIds: string[], by: string) => {
    if (!channels.some((c) => c.id === TEAM_ID)) {
      add({
        id: TEAM_ID,
        kind: "team",
        name: "allgemein",
        accountId: null,
        members: [],
        createdBy: by,
        confidential: false,
      });
    }
    for (const accountId of sharedAccountIds) {
      if (channels.some((c) => c.kind === "mailbox" && c.accountId === accountId)) continue;
      add({
        id: nextId(),
        kind: "mailbox",
        name: null,
        accountId,
        members: [],
        createdBy: by,
        confidential: false,
      });
    }
  };
  const unreadOf = (channel: Channel, me: string) => {
    const since =
      reads[channel.id]?.[me] ?? new Date(now().getTime() - UNREAD_WITHOUT_MARK_MS).toISOString();
    const unread = messages.filter(
      (m) => m.channelId === channel.id && m.authorId !== me && !m.deleted && m.createdAt > since,
    );
    return {
      // Answers count only when they mention one or stand in the channel too.
      unread: unread.filter((m) => !m.parentId || m.alsoInChannel).length,
      mentions: unread.filter((m) => m.mentions.includes(me)).length,
    };
  };
  const lastOf = (channelId: string) => {
    const last = messages
      .filter((m) => m.channelId === channelId && (!m.parentId || m.alsoInChannel))
      .at(-1);
    return last ? { authorId: last.authorId, text: messageSummary(last) } : null;
  };
  return {
    list: async (viewer, sharedAccountIds) => {
      ensureStandard(sharedAccountIds, viewer.me);
      return channels
        .filter((channel) => canSee(channel, viewer))
        .map((channel) => ({
          ...channel,
          lastMessageAt:
            // An answer leaves the channel's order as it is, unless it stands there too.
            messages
              .filter((m) => m.channelId === channel.id && (!m.parentId || m.alsoInChannel))
              .at(-1)?.createdAt ?? null,
          ...unreadOf(channel, viewer.me),
          readAt: reads[channel.id]?.[viewer.me] ?? null,
          last: lastOf(channel.id),
          muted: muted.has(`${channel.id}/${viewer.me}`),
        }));
    },
    get: async (id) => channels.find((channel) => channel.id === id) ?? null,
    createChannel: async (name, members, createdBy, confidential = false) => {
      const everyone = [...new Set([createdBy, ...members])];
      const channel = add({
        id: nextId(),
        kind: "channel",
        name,
        accountId: null,
        members: everyone,
        createdBy,
        confidential,
      });
      joined(channel.id, everyone);
      return channel;
    },
    direct: async (members, createdBy, confidential = false) => {
      const everyone = [...new Set([createdBy, ...members])];
      return (
        channels.find(
          (c) =>
            c.kind === "direct" &&
            c.confidential === confidential &&
            directKey(c.members) === directKey(everyone),
        ) ??
        add({
          id: nextId(),
          kind: "direct",
          name: null,
          accountId: null,
          members: everyone,
          createdBy,
          confidential,
        })
      );
    },
    update: async (id, patch) => {
      const channel = channels.find((c) => c.id === id);
      if (!channel) return null;
      if (patch.members)
        joined(
          id,
          patch.members.filter((m) => !channel.members.includes(m)),
        );
      Object.assign(channel, patch);
      return channel;
    },
    markRead: async (channelId, memberId, at) => {
      const before = reads[channelId]?.[memberId];
      // Never moves the mark back.
      const mark = before && before > at.toISOString() ? before : at.toISOString();
      reads[channelId] = { ...reads[channelId], [memberId]: mark };
      return new Date(mark);
    },
    reads: async (channelId) => reads[channelId] ?? {},
    mute: async (channelId, memberId, on) => {
      if (on) muted.add(`${channelId}/${memberId}`);
      else muted.delete(`${channelId}/${memberId}`);
    },
    leave: async (channelId, memberId) => {
      const channel = channels.find((c) => c.id === channelId);
      if (channel) channel.members = channel.members.filter((m) => m !== memberId);
      return channel?.members.length === 0;
    },
    audience: async (channelId) => ({
      readers: Object.keys(reads[channelId] ?? {}),
      muted: [...muted]
        .filter((key) => key.startsWith(`${channelId}/`))
        .map((key) => key.split("/")[1]!),
    }),
    remove: async (channelId) => {
      const index = channels.findIndex((c) => c.id === channelId);
      if (index >= 0) channels.splice(index, 1);
    },
  };
};

/** The three stores the chat's routes take, sharing one memory; `blobs` holds the files' bytes. */
export const createMemoryChat = (now: Clock = () => new Date()) => {
  const { files, stored, blobs, removedChannels } = createFiles();
  const { store: messages, messages: all } = createMessages(files, now);
  return { store: createChannels(all, now), messages, files, stored, blobs, removedChannels };
};
