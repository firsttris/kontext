import { createFileRoute } from "@tanstack/react-router";
import { ChatPage } from "@/features/chat/chat-page";
import { z } from "@/lib/zod";

export const chatSearchSchema = z.object({
  /** The open channel or direct conversation. */
  channel: z.string().optional(),
  /** A message to show, e.g. the one a task was made from. */
  message: z.string().optional(),
  /** The message whose thread is open beside the conversation. */
  thread: z.string().optional(),
});

export const Route = createFileRoute("/_app/chat")({
  validateSearch: chatSearchSchema,
  component: ChatRoute,
});

function ChatRoute() {
  const search = Route.useSearch();
  return (
    <ChatPage channelId={search.channel} messageId={search.message} threadId={search.thread} />
  );
}
