/**
 * "Papierkorb leeren" / "Spam leeren" above the list of those folders, with a question first:
 * what goes there is gone for good (Stalwart's Community edition keeps no deleted mails).
 */
import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { emptyMailbox } from "@/jmap/empty-mailbox";
import type { Mailbox } from "@/jmap/types";
import { mailboxRights } from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";

/** Only for Spam and Papierkorb with mails in them, and where the user may delete. */
export const canEmpty = (mailbox: Mailbox): boolean =>
  (mailbox.role === "trash" || mailbox.role === "junk") &&
  mailbox.totalEmails > 0 &&
  mailboxRights(mailbox).canRemove;

export const EmptyFolder = ({ accountId, mailbox }: { accountId: string; mailbox: Mailbox }) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const trash = mailbox.role === "trash";
  const label = trash ? m.mail_empty_trash() : m.mail_empty_junk();

  const empty = async () => {
    setBusy(true);
    try {
      await emptyMailbox(client, accountId, mailbox.id);
      toast.show(trash ? m.mail_trash_emptied() : m.mail_junk_emptied());
      setAsking(false);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: [accountId] });
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="self-start" onClick={() => setAsking(true)}>
        <Trash2 size={14} aria-hidden="true" /> {label}
      </Button>
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={`${label}?`}
        description={
          mailbox.totalEmails === 1
            ? m.mail_empty_folder_hint_one()
            : m.mail_empty_folder_hint({ count: mailbox.totalEmails })
        }
      >
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => setAsking(false)}>
            {m.mail_later_cancel()}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void empty()}>
            {m.mail_empty_folder_confirm()}
          </Button>
        </div>
      </Dialog>
    </>
  );
};
