import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { CAPABILITIES } from "@/jmap/client";
import { listIdentities } from "@/jmap/mail";
import { getAccountSettings, getVacation, hasTwoFactor } from "@/jmap/settings";

export const usePersonalAccountId = (): string | undefined => {
  const { data: session } = useSession();
  return session?.primaryAccounts[CAPABILITIES.mail];
};

export const useAccountSettings = () => {
  const client = useClient();
  return useQuery({ queryKey: ["settings", "account"], queryFn: () => getAccountSettings(client) });
};

export const useTwoFactor = () => {
  const client = useClient();
  return useQuery({ queryKey: ["settings", "twoFactor"], queryFn: () => hasTwoFactor(client) });
};

export const useVacation = () => {
  const client = useClient();
  const accountId = usePersonalAccountId();
  return useQuery({
    queryKey: [accountId, "vacation"],
    queryFn: () => getVacation(client, accountId!),
    enabled: Boolean(accountId),
  });
};

export const usePersonalIdentities = () => {
  const client = useClient();
  const accountId = usePersonalAccountId();
  return useQuery({
    queryKey: [accountId, "identities"],
    queryFn: () => listIdentities(client, accountId!),
    enabled: Boolean(accountId),
  });
};

/** Runs a save and refreshes what it touched; the caller shows the result. */
export const useSave = <T>(save: (value: T) => Promise<unknown>, keys: unknown[][]) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: save,
    onSettled: () =>
      Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey }))),
  });
};
