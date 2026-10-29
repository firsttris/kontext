/**
 * Where a rules list comes from and goes to: the own mailbox through JMAP, or a shared mailbox
 * (info@ & co.) or an employee's mailbox through the Firmenverwaltung on the server. The list and
 * the dialog only see this.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { setFilters } from "@/jmap/rules";
import type { Mailbox } from "@/jmap/types";
import type { Category } from "@/lib/categories";
import { type Rule, type RuleFolder, ruleFolders } from "@/lib/rules";
import { applyToInbox } from "../../../server/rules/apply";
import { useCategories } from "../categories/queries";
import {
  applyAccountRule,
  getAccountRules,
  type RulesOwner,
  setAccountRules,
} from "../company/api";
import { useAllMailboxes } from "../mail/queries";
import { useFilters, usePersonalAccountId } from "../settings/queries";

export type RulesStore = {
  /** Undefined while loading. */
  rules: Rule[] | undefined;
  folders: RuleFolder[];
  /** The mailbox's categories, for "Kategorie setzen". */
  categories: Category[];
  save: (rules: Rule[]) => Promise<void>;
  /** One rule over the mails already in the inbox; how many it changed. */
  apply: (rule: Rule) => Promise<number>;
  saving: boolean;
};

export const usePersonalRules = (): RulesStore => {
  const client = useClient();
  const queryClient = useQueryClient();
  const accountId = usePersonalAccountId();
  const { data: filters } = useFilters();
  const mailboxes = useAllMailboxes()[accountId ?? ""] ?? [];
  const categories = useCategories(accountId);
  const save = useMutation({
    // The out-of-office reply goes along unchanged.
    mutationFn: (rules: Rule[]) =>
      setFilters(client, accountId!, { rules, vacation: filters!.vacation }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: [accountId, "filters"] }),
  });
  const apply = async (rule: Rule) => {
    const changed = await applyToInbox(client.request, accountId!, [rule]);
    // Lists and counts of the account show the moved and marked mails.
    await queryClient.invalidateQueries({ queryKey: [accountId] });
    return changed;
  };
  return {
    rules: filters?.rules,
    folders: ruleFolders(mailboxes),
    categories,
    save: async (rules) => void (await save.mutateAsync(rules)),
    apply,
    saving: save.isPending,
  };
};

/** The rules of a shared mailbox or an employee, kept by the admin through the server. */
export const useCompanyRules = (owner: RulesOwner): RulesStore => {
  const queryClient = useQueryClient();
  const queryKey = ["company", "rules", owner.kind, owner.id];
  const { data } = useQuery({ queryKey, queryFn: () => getAccountRules(owner) });
  const save = useMutation({
    mutationFn: (rules: Rule[]) => setAccountRules(owner, rules),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  return {
    rules: data?.rules,
    // The server sends the folder fields the tree needs; the rest of a Mailbox is not used.
    folders: ruleFolders((data?.folders ?? []) as Mailbox[]),
    categories: data?.categories ?? [],
    save: async (rules) => void (await save.mutateAsync(rules)),
    apply: async (rule) => (await applyAccountRule(owner, rule)).changed,
    saving: save.isPending,
  };
};
