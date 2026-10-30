import { createFileRoute } from "@tanstack/react-router";
import { SecureSentPage } from "@/features/secure/sent-page";
import { z } from "@/lib/zod";

export const Route = createFileRoute("/_app/secure")({
  validateSearch: z.object({ message: z.string().optional() }),
  component: SecureRoute,
});

function SecureRoute() {
  const { message } = Route.useSearch();
  return <SecureSentPage messageId={message} />;
}
