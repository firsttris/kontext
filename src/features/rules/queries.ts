import { useClient } from "@/auth/auth";
import { setFilters } from "@/jmap/rules";
import { flattenTree, folderTree, mailboxPath, systemMailboxes } from "@/lib/mailboxes";
import type { Rule } from "@/lib/rules";
import { sievePath } from "@/lib/rules";
import { useAllMailboxes } from "../mail/queries";
import { useFilters, usePersonalAccountId, useSave } from "../settings/queries";

/** Stores the whole list; the out-of-office reply goes along unchanged. */
export const useSaveRules = () => {
  const client = useClient();
  const accountId = usePersonalAccountId();
  const { data: filters } = useFilters();
  return useSave(
    (rules: Rule[]) => setFilters(client, accountId!, { rules, vacation: filters!.vacation }),
    [[accountId, "filters"]],
  );
};

export type RuleFolder = { id: string; label: string; path: string };

/** Where a rule can file a mail: the own mailbox's folders, but not back into the inbox. */
const NOT_A_TARGET = new Set(["inbox", "drafts", "sent", "flagged"]);

export const useRuleFolders = (): RuleFolder[] => {
  const accountId = usePersonalAccountId();
  const mailboxes = useAllMailboxes()[accountId ?? ""] ?? [];
  return [
    ...systemMailboxes(mailboxes),
    ...flattenTree(folderTree(mailboxes)).map((n) => n.mailbox),
  ]
    .filter((mailbox) => !NOT_A_TARGET.has(mailbox.role ?? ""))
    .map((mailbox) => ({
      id: mailbox.id,
      label: mailboxPath(mailbox, mailboxes),
      path: sievePath(mailbox, mailboxes),
    }));
};
