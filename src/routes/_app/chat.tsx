import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ChatPage } from "@/features/chat/chat-page";

export const chatSearchSchema = z.object({
  /** The open channel or direct conversation. */
  channel: z.string().optional(),
});

export const Route = createFileRoute("/_app/chat")({
  validateSearch: chatSearchSchema,
  component: ChatRoute,
});

function ChatRoute() {
  return <ChatPage channelId={Route.useSearch().channel} />;
}
