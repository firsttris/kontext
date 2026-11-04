/**
 * Tells the company admin when Stalwart is not set up for Kontext's sign-in: the OAuth client
 * `kontext` is missing or lacks the scope `full` (server/company/oauth-client.ts), e.g. after the
 * update to Stalwart 1.0.3. Whoever is still signed in sees it; new sign-ins fail until fixed.
 * Nothing is shown when all is well or when the key may not read the clients.
 */
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { m } from "@/paraglide/messages";
import { getOAuthClient } from "./api";

export const OAuthClientNotice = () => {
  const { data } = useQuery({
    queryKey: ["company", "oauth-client"],
    queryFn: getOAuthClient,
    retry: false,
  });
  if (data?.status !== "missing" && data?.status !== "noFullScope") return null;
  return (
    <p
      role="alert"
      className="m-0 flex items-start gap-2 rounded-lg bg-subtle px-3 py-2 text-[13px] text-fg"
    >
      <TriangleAlert size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-danger" />
      {data.status === "missing"
        ? m.company_oauth_client_missing()
        : m.company_oauth_client_no_full()}
    </p>
  );
};
