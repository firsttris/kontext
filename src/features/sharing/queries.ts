import { useQuery } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { CAPABILITIES } from "@/jmap/client";
import { listPrincipals, principalName } from "@/jmap/principals";

/** Everyone in the company (people and shared mailboxes); changes rarely. */
export const usePrincipals = () => {
  const client = useClient();
  const { data: session } = useSession();
  const accountId = session?.primaryAccounts[CAPABILITIES.principals];
  return useQuery({
    queryKey: [accountId, "principals"],
    queryFn: () => listPrincipals(client, accountId!),
    enabled: Boolean(accountId),
    staleTime: 10 * 60_000,
  });
};

/** The other people of the company (no shared mailboxes), by name. */
export const useColleagues = () => {
  const { data: session } = useSession();
  const { data = [], isPending } = usePrincipals();
  const colleagues = data
    .filter((p) => p.type === "individual" && p.email !== session?.username)
    .sort((a, b) => principalName(a).localeCompare(principalName(b), "de"));
  return { colleagues, isPending };
};
