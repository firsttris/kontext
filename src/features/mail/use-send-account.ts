/**
 * Which account a mail is sent from. In a shared mailbox the user is a member of, the mailbox's
 * own address (its identities); a mailbox that was only shared for reading has no identities for
 * the user, so the answer goes out from the own address and lands in the own Sent folder. From
 * the own account, one's other mailboxes (Gmail, GMX, …) are senders too.
 */
import { useMemo } from "react";
import { useSession } from "@/components/shell/app-shell";
import { externalIdentity } from "@/features/external/api";
import { useExternalAccounts } from "@/features/external/queries";
import { useIdentities, useMailAccounts, useMailboxes } from "./queries";

/** `withExternal`: the composer also offers the other mailboxes, which send through their server. */
export const useSendAccount = (accountId: string, withExternal = false) => {
  const { data: session } = useSession();
  const accounts = useMailAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const own = accounts.find((a) => a.isPersonal);
  const sharedIdentities = useIdentities(accountId);
  const sendAccountId =
    account?.isPersonal || !sharedIdentities.isError ? accountId : (own?.id ?? accountId);
  const { data: stalwartIdentities = [] } = useIdentities(sendAccountId);
  const { data: external, isPending: externalPending } = useExternalAccounts();
  const { data: mailboxes = [] } = useMailboxes(sendAccountId);
  const { data: ownIdentities = [] } = useIdentities(own?.id ?? accountId);
  const myName =
    ownIdentities.find((i) => i.email.toLowerCase() === session?.username.toLowerCase())?.name ??
    "";
  const identities = useMemo(() => {
    if (!withExternal || sendAccountId !== own?.id || !external?.length) return stalwartIdentities;
    const login = stalwartIdentities.find(
      (i) => i.email.toLowerCase() === session?.username.toLowerCase(),
    );
    return [
      ...stalwartIdentities,
      ...external.map((account) => externalIdentity(account, login ?? stalwartIdentities[0])),
    ];
  }, [stalwartIdentities, external, withExternal, sendAccountId, own?.id, session?.username]);
  // The composer picks its sender once: with the other mailboxes still loading, a reply to a
  // mail fetched from Gmail (or a draft written as that address) would get the wrong one.
  const sendersReady = !withExternal || !externalPending;
  return { account, own, sendAccountId, identities, mailboxes, myName, sendersReady };
};
