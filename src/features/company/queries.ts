import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { getCompany, isCompanyAdmin } from "./api";

export const useIsCompanyAdmin = () =>
  useQuery({
    queryKey: ["company", "me"],
    queryFn: isCompanyAdmin,
    staleTime: 5 * 60_000,
    retry: false,
  }).data ?? false;

export const useCompany = () =>
  useQuery({ queryKey: ["company", "all"], queryFn: getCompany, retry: false });

/**
 * A change in the Firmenverwaltung; afterwards the list and the JMAP session (new shared
 * mailboxes, names) are loaded again.
 */
export const useCompanyChange = <T, R>(change: (value: T) => Promise<R>) => {
  const queryClient = useQueryClient();
  const client = useClient();
  return useMutation({
    mutationFn: change,
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company", "all"] });
      queryClient.setQueryData(["session"], await client.fetchSession());
    },
  });
};
