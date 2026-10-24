/** The JMAP session (accounts, capabilities), loaded once per sign-in. */
import { useQuery } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";

export const useSession = () => {
  const client = useClient();
  return useQuery({
    queryKey: ["session"],
    queryFn: () => client.getSession(),
    staleTime: Number.POSITIVE_INFINITY,
  });
};
