/**
 * The team chat from Kontext's server (/api/chat). The live connection (features/live) keeps
 * these caches current; what one writes shows at once and is replaced by the server's answer.
 */
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";
import type { Channel, ChannelSummary, Message } from "@/lib/chat";
import type { Card, ChatFile } from "@/lib/chat-cards";

export const CHAT_KEY = ["chat"];
export const CHANNELS_KEY = ["chat", "channels"];
export const DISCUSSED_KEY = ["chat", "discussed"];
export const messagesKey = (channelId: string) => ["chat", "messages", channelId];

/** A message to send; `files` are already uploaded. */
export type Post = {
  channelId: string;
  text: string;
  mentions: string[];
  cards: Card[];
  files: ChatFile[];
};

export type Discussion = {
  channelId: string;
  messageId: string;
  createdAt: string;
  replies: number;
};

/** Where a mail (or its thread) was discussed, in channels one sees; the latest first. */
export const useDiscussions = (ref: string, threadId: string | null) =>
  useQuery({
    queryKey: [...DISCUSSED_KEY, ref, threadId],
    queryFn: async () =>
      (
        await send<{ discussions: Discussion[] }>(
          "GET",
          `/discussed?ref=${encodeURIComponent(ref)}&thread=${encodeURIComponent(threadId ?? "")}`,
        )
      ).discussions,
  }).data ?? [];

/** Messages with these words in all channels one sees (from two letters on). */
export const useChatSearch = (words: string) =>
  useQuery({
    queryKey: ["chat", "search", words],
    queryFn: async () =>
      (await send<{ messages: Message[] }>("GET", `/search?q=${encodeURIComponent(words)}`))
        .messages,
    enabled: words.trim().length >= 2,
    staleTime: 10_000,
  });

/** Channels where mails of this sender were discussed before. */
export const useSuggestions = (party: string) =>
  useQuery({
    queryKey: ["chat", "suggestions", party],
    queryFn: async () =>
      (
        await send<{ channelIds: string[] }>(
          "GET",
          `/suggestions?party=${encodeURIComponent(party)}`,
        )
      ).channelIds,
    enabled: Boolean(party),
  }).data ?? [];

export type ChannelsData = { channels: ChannelSummary[]; online: string[] };
export type MessagePage = { messages: Message[]; hasMore: boolean; reads: Record<string, string> };
type Messages = InfiniteData<MessagePage, string | null>;

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/chat${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

const channelPath = (id: string) => `/channels/${encodeURIComponent(id)}`;

export const useChannels = () => {
  const { data, isPending } = useQuery({
    queryKey: CHANNELS_KEY,
    queryFn: () => send<ChannelsData>("GET", "/channels"),
  });
  return { channels: data?.channels ?? [], online: data?.online ?? [], isPending };
};

/** The messages of a channel, oldest first; older ones page in with `loadOlder`. */
export const useMessages = (channelId: string) => {
  const query = useInfiniteQuery({
    queryKey: messagesKey(channelId),
    queryFn: ({ pageParam }) =>
      send<MessagePage>(
        "GET",
        `${channelPath(channelId)}/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => (page.hasMore ? (page.messages.at(-1)?.createdAt ?? null) : null),
  });
  const pages = query.data?.pages ?? [];
  return {
    messages: pages.flatMap((page) => page.messages).reverse(),
    reads: pages[0]?.reads ?? {},
    isPending: query.isPending,
    hasOlder: query.hasNextPage,
    loadOlder: () => void query.fetchNextPage(),
    loadingOlder: query.isFetchingNextPage,
  };
};

/** Adds a message to the cached first page, once (the live event and the answer may both come). */
export const addMessage = (queryClient: QueryClient, message: Message, replaces?: string) =>
  queryClient.setQueryData<Messages>(messagesKey(message.channelId), (data) => {
    if (!data) return data;
    const [first, ...rest] = data.pages;
    if (!first) return data;
    const others = first.messages.filter((m) => m.id !== message.id && m.id !== replaces);
    const messages = [message, ...others].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { ...data, pages: [{ ...first, messages }, ...rest] };
  });

export const setRead = (
  queryClient: QueryClient,
  channelId: string,
  memberId: string,
  at: string,
) =>
  queryClient.setQueryData<Messages>(messagesKey(channelId), (data) => {
    const [first, ...rest] = data?.pages ?? [];
    if (!data || !first) return data;
    if ((first.reads[memberId] ?? "") >= at) return data;
    return { ...data, pages: [{ ...first, reads: { ...first.reads, [memberId]: at } }, ...rest] };
  });

const patchChannel = (
  queryClient: QueryClient,
  channelId: string,
  change: (channel: ChannelSummary) => ChannelSummary,
) =>
  queryClient.setQueryData<ChannelsData>(CHANNELS_KEY, (data) =>
    data
      ? {
          ...data,
          channels: data.channels.map((channel) =>
            channel.id === channelId ? change(channel) : channel,
          ),
        }
      : data,
  );

export const useChatActions = (me: string) => {
  const queryClient = useQueryClient();
  const refreshChannels = () => queryClient.invalidateQueries({ queryKey: CHANNELS_KEY });

  const post = useMutation({
    mutationFn: async ({ channelId, files, ...body }: Post) =>
      (
        await send<{ message: Message }>("POST", `${channelPath(channelId)}/messages`, {
          ...body,
          fileIds: files.map((file) => file.id),
        })
      ).message,
    onMutate: ({ channelId, text, mentions, cards, files }) => {
      const pending: Message = {
        id: `pending-${crypto.randomUUID()}`,
        channelId,
        authorId: me,
        text,
        mentions,
        files,
        cards,
        createdAt: new Date().toISOString(),
        editedAt: null,
        deleted: false,
        call: null,
      };
      addMessage(queryClient, pending);
      return { pending };
    },
    onSuccess: (message, _input, context) => {
      addMessage(queryClient, message, context?.pending.id);
      setRead(queryClient, message.channelId, me, message.createdAt);
    },
    onError: (_error, input, context) => {
      if (context) {
        void queryClient.invalidateQueries({ queryKey: messagesKey(input.channelId) });
      }
    },
    onSettled: refreshChannels,
  });

  const markRead = useMutation({
    mutationFn: ({ channelId, at }: { channelId: string; at: string }) =>
      send<{ at: string }>("POST", `${channelPath(channelId)}/read`, { at }),
    onMutate: ({ channelId, at }) => {
      patchChannel(queryClient, channelId, (channel) => ({
        ...channel,
        unread: 0,
        mentions: 0,
        readAt: at,
      }));
      setRead(queryClient, channelId, me, at);
    },
  });

  const createChannel = useMutation({
    mutationFn: async (input: { name: string; members: string[] }) =>
      (await send<{ channel: Channel }>("POST", "/channels", input)).channel,
    onSettled: refreshChannels,
  });

  const updateChannel = useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; name?: string; members?: string[] }) =>
      (await send<{ channel: Channel }>("PATCH", channelPath(id), patch)).channel,
    onSettled: refreshChannels,
  });

  const openDirect = useMutation({
    mutationFn: async (members: string[]) =>
      (await send<{ channel: Channel }>("POST", "/direct", { members })).channel,
    onSettled: refreshChannels,
  });

  /** Tells the others that one is writing; at most every few seconds. */
  const lastTyping = useRef(0);
  const typing = (channelId: string) => {
    const now = Date.now();
    if (now - lastTyping.current < 3000) return;
    lastTyping.current = now;
    void send("POST", `${channelPath(channelId)}/typing`).catch(() => undefined);
  };

  /** Edited or deleted: the server's answer replaces the message (also live for the others). */
  const replaced = (message: Message) => addMessage(queryClient, message);

  const edit = useMutation({
    mutationFn: async ({ id, text, mentions }: { id: string; text: string; mentions: string[] }) =>
      (
        await send<{ message: Message }>("PATCH", `/messages/${encodeURIComponent(id)}`, {
          text,
          mentions,
        })
      ).message,
    onSuccess: replaced,
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      (await send<{ message: Message }>("DELETE", `/messages/${encodeURIComponent(id)}`)).message,
    onSuccess: replaced,
    onSettled: refreshChannels,
  });

  const mute = useMutation({
    mutationFn: ({ channelId, muted }: { channelId: string; muted: boolean }) =>
      send("POST", `${channelPath(channelId)}/mute`, { muted }),
    onMutate: ({ channelId, muted }) =>
      patchChannel(queryClient, channelId, (channel) => ({ ...channel, muted })),
    onSettled: refreshChannels,
  });

  const leave = useMutation({
    mutationFn: (channelId: string) => send("POST", `${channelPath(channelId)}/leave`),
    onSettled: refreshChannels,
  });

  const removeChannel = useMutation({
    mutationFn: (channelId: string) => send("DELETE", channelPath(channelId)),
    onSettled: refreshChannels,
  });

  return {
    post,
    markRead,
    createChannel,
    updateChannel,
    openDirect,
    typing,
    edit,
    remove,
    mute,
    leave,
    removeChannel,
  };
};
