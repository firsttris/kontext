import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SecureSentPage } from "@/features/secure/sent-page";

export const Route = createFileRoute("/_app/secure")({
  validateSearch: z.object({ message: z.string().optional() }),
  component: SecureRoute,
});

function SecureRoute() {
  const { message } = Route.useSearch();
  return <SecureSentPage messageId={message} />;
}
