import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ChatPage } from "@/features/chat/chat-page";

export const chatSearchSchema = z.object({
  /** The open channel or direct conversation. */
  channel: z.string().optional(),
  /** A message to show, e.g. the one a task was made from. */
  message: z.string().optional(),
});

export const Route = createFileRoute("/_app/chat")({
  validateSearch: chatSearchSchema,
  component: ChatRoute,
});

function ChatRoute() {
  const search = Route.useSearch();
  return <ChatPage channelId={search.channel} messageId={search.message} />;
}
