/**
 * Read receipts for one's own sent mails are filed away quietly: read, into the archive. They are
 * shown at the sent mail ("Gelesen von …"), not as mails of their own. Only receipts that confirm
 * a mail in the account's Sent which asked for one (src/jmap/receipts.ts); everything else stays.
 */
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useClient } from "@/auth/auth";
import { receiptsToFile } from "@/jmap/receipts";
import { findRole, mailboxRights } from "@/lib/mailboxes";
import { useMailActions } from "./actions";
import { useAllMailboxes, useInboxes } from "./queries";

/** One account: its inbox's new receipts, filed once each. */
const QuietReceiptsOf = ({
  accountId,
  inboxId,
  sentId,
}: {
  accountId: string;
  inboxId: string;
  sentId: string;
}) => {
  const client = useClient();
  const { archiveRead } = useMailActions();
  // Under the account's mails: a new mail arriving asks again.
  const { data } = useQuery({
    queryKey: [accountId, "emails", "receipts-to-file", inboxId, sentId],
    queryFn: () => receiptsToFile(client, accountId, { inboxId, sentId }, new Date()),
    refetchOnWindowFocus: false,
  });
  const filed = useRef(new Set<string>());
  useEffect(() => {
    const fresh = (data ?? []).filter((id) => !filed.current.has(id));
    if (!fresh.length) return;
    for (const id of fresh) filed.current.add(id);
    // Quietly: a receipt that could not be moved simply stays in the inbox.
    archiveRead(accountId, fresh, inboxId).catch(() => undefined);
  }, [data, archiveRead, accountId, inboxId]);
  return null;
};

/** For every mailbox one may take mails out of: the own and the shared ones. */
export const QuietReceipts = () => {
  const inboxes = useInboxes();
  const mailboxes = useAllMailboxes();
  return (
    <>
      {inboxes.map(({ account, mailbox }) => {
        const sent = findRole(mailboxes[account.id] ?? [], "sent");
        return sent && !account.isReadOnly && mailboxRights(mailbox).canRemove ? (
          <QuietReceiptsOf
            key={account.id}
            accountId={account.id}
            inboxId={mailbox.id}
            sentId={sent.id}
          />
        ) : null;
      })}
    </>
  );
};
