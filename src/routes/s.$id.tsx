import { createFileRoute } from "@tanstack/react-router";
import { SecurePage } from "@/features/secure/secure-page";

/** A confidential message by link: for recipients outside, without signing in, with a code. */
export const Route = createFileRoute("/s/$id")({
  component: SecureRoute,
});

function SecureRoute() {
  const { id } = Route.useParams();
  return <SecurePage id={id} />;
}
