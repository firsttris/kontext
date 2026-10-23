/**
 * Which account a mail is sent from. In a shared mailbox the user is a member of, the mailbox's
 * own address (its identities); a mailbox that was only shared for reading has no identities for
 * the user, so the answer goes out from the own address and lands in the own Sent folder.
 */
import { useSession } from "@/components/shell/app-shell";
import { useIdentities, useMailAccounts, useMailboxes } from "./queries";

export const useSendAccount = (accountId: string) => {
  const { data: session } = useSession();
  const accounts = useMailAccounts();
  const account = accounts.find((a) => a.id === accountId);
  const own = accounts.find((a) => a.isPersonal);
  const sharedIdentities = useIdentities(accountId);
  const sendAccountId =
    account?.isPersonal || !sharedIdentities.isError ? accountId : (own?.id ?? accountId);
  const { data: identities = [] } = useIdentities(sendAccountId);
  const { data: mailboxes = [] } = useMailboxes(sendAccountId);
  const { data: ownIdentities = [] } = useIdentities(own?.id ?? accountId);
  const myName =
    ownIdentities.find((i) => i.email.toLowerCase() === session?.username.toLowerCase())?.name ??
    "";
  return { account, own, sendAccountId, identities, mailboxes, myName };
};
