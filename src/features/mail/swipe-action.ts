/**
 * What a swipe on a line of the list does to its mail: archive, delete, read/unread or flag, as
 * the picked-mails bar does it for one mail. Read/unread follows what the line shows: a
 * conversation shown unread has its unread mails marked read. Archive and delete offer
 * "Rückgängig" (undo.ts). A refusal (a mailbox only to read) is said.
 */
import { useToast } from "@/components/ui/toast";
import type { EmailSummary } from "@/jmap/types";
import { groupsOf } from "@/lib/selection";
import type { SwipeAction } from "@/lib/swipe";
import { m } from "@/paraglide/messages";
import { useMailActions } from "./actions";
import { useOfferUndo } from "./undo";
import type { Group } from "./use-thread-info";

export const useSwipeAction = (folderId?: string) => {
  const actions = useMailActions();
  const toast = useToast();
  const offerUndo = useOfferUndo();
  const run = async (
    accountId: string,
    email: EmailSummary,
    action: SwipeAction,
    group?: Group,
  ) => {
    const ids = [email.id];
    const from = groupsOf([{ accountId, email }], folderId)[0]?.from ?? "";
    switch (action) {
      case "archive":
        return offerUndo(m.mail_archived(), [await actions.archive(accountId, ids, from)]);
      case "delete":
        return offerUndo(m.mail_trashed(), [await actions.remove(accountId, ids, from)]);
      case "read": {
        const unread = group ? group.unread : !email.keywords.$seen;
        return actions.setSeen(accountId, unread && group ? group.unreadIds : ids, unread);
      }
      case "flag":
        return actions.setFlagged(accountId, ids, !email.keywords.$flagged);
      case "none":
        return;
    }
  };
  return (accountId: string, email: EmailSummary, action: SwipeAction, group?: Group) =>
    void run(accountId, email, action, group).catch((error: Error) =>
      toast.show(m.common_error({ message: error.message }), "error"),
    );
};
