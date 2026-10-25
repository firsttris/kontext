import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listExternalAccounts } from "./api";

export const EXTERNAL_KEY = ["external-accounts"];

/** One's other mailboxes; `data` is null where the server does not offer them. */
export const useExternalAccounts = () =>
  useQuery({
    queryKey: EXTERNAL_KEY,
    queryFn: listExternalAccounts,
    staleTime: 60_000,
    // While a first fetch runs, the numbers change by the second.
    refetchInterval: (query) =>
      query.state.data?.some((account) => account.status === "running") ? 3000 : false,
  });

/** A change to the accounts; the list is loaded again afterwards. */
export const useExternalChange = <T, R>(change: (value: T) => Promise<R>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSettled: () => queryClient.invalidateQueries({ queryKey: EXTERNAL_KEY }),
  });
};
