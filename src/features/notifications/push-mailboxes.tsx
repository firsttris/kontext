/**
 * Which mailboxes report new mail on this person's devices: all at first; someone who only helps
 * out in info@ switches it off there. Kept on the server, for all their devices.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { useMailAccounts } from "@/features/mail/queries";
import { shortAddress } from "@/lib/mail-accounts";
import { m } from "@/paraglide/messages";

const KEY = ["push", "mailboxes"];

const send = async (method: string, path: string, body?: unknown) => {
  const response = await fetch(`/api/push${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as { off?: string[]; error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result.off ?? [];
};

export const PushMailboxes = () => {
  const accounts = useMailAccounts();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: off = [] } = useQuery({ queryKey: KEY, queryFn: () => send("GET", "/mailboxes") });
  const toggle = useMutation({
    mutationFn: ({ accountId, on }: { accountId: string; on: boolean }) =>
      send("PUT", `/mailboxes/${encodeURIComponent(accountId)}`, { on }),
    onMutate: ({ accountId, on }) =>
      queryClient.setQueryData<string[]>(KEY, (current = []) =>
        on ? current.filter((id) => id !== accountId) : [...current, accountId],
      ),
    onSuccess: (next) => queryClient.setQueryData(KEY, next),
    onError: (error: Error) => {
      toast.show(m.common_error({ message: error.message }), "error");
      void queryClient.invalidateQueries({ queryKey: KEY });
    },
  });
  if (accounts.length < 2) return null;
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1 text-[12px] font-medium text-muted">
        {m.notifications_mailboxes()}
      </legend>
      {accounts.map((account) => (
        <Switch
          key={account.id}
          checked={!off.includes(account.id)}
          onChange={(on) => toggle.mutate({ accountId: account.id, on })}
        >
          {account.isPersonal ? m.notifications_own_mailbox() : shortAddress(account.name)}
        </Switch>
      ))}
    </fieldset>
  );
};
