/**
 * Answers and reactions in the chat: the thread of a message (its first message and answers,
 * kept current by the live connection like the channel), and emojis, shown at once.
 */
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Message, toggleReaction } from "@/lib/chat";
import { addMessage, send, type Thread, threadKey } from "./queries";

export const useThread = (parentId: string | undefined) => {
  const { data, isPending, isError } = useQuery({
    queryKey: threadKey(parentId ?? ""),
    queryFn: () => send<Thread>("GET", `/messages/${encodeURIComponent(parentId ?? "")}/replies`),
    enabled: Boolean(parentId),
  });
  return { thread: data, isPending, isError };
};

/** The message as cached (channel or thread), changed in place. */
const patchMessage = (
  queryClient: QueryClient,
  message: Message,
  change: (message: Message) => Message,
) => addMessage(queryClient, change(message));

export const useReact = (me: string) => {
  const queryClient = useQueryClient();
  const react = useMutation({
    mutationFn: async ({ message, emoji, on }: { message: Message; emoji: string; on: boolean }) =>
      (
        await send<{ message: Message }>(
          "POST",
          `/messages/${encodeURIComponent(message.id)}/reactions`,
          { emoji, on },
        )
      ).message,
    onMutate: ({ message, emoji, on }) =>
      patchMessage(queryClient, message, (current) => ({
        ...current,
        reactions: toggleReaction(current.reactions, emoji, me, on),
      })),
    onSuccess: (message) => addMessage(queryClient, message),
    onError: (_error, { message }) => addMessage(queryClient, message),
  });
  /** Mine already: taken away; else added. */
  return (message: Message, emoji: string) =>
    react.mutate({
      message,
      emoji,
      on: !message.reactions.some((r) => r.emoji === emoji && r.members.includes(me)),
    });
};
