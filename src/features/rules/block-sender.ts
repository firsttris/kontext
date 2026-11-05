/**
 * "Absender blockieren": a rule at the top of the own rules that files the sender's mail into
 * Spam (lib/rules.ts `blockRule`). Stalwart has no per-account blocklist; its spam lists are
 * server-wide and kept by the admin (crates/registry/src/schema/structs.rs, v1.0.3), so a rule
 * is the way, and it is removed again in the rules list.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { getFilters, setFilters } from "@/jmap/rules";
import { findRole } from "@/lib/mailboxes";
import { type BlockScope, blockRule, sievePath } from "@/lib/rules";
import { useAllMailboxes } from "../mail/queries";

/** Blocks in the own mailbox `accountId`; undefined where it has no Spam folder. */
export const useBlockSender = (accountId: string) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const mailboxes = useAllMailboxes()[accountId] ?? [];
  const junk = findRole(mailboxes, "junk");
  if (!junk) return undefined;
  return async (address: string, scope: BlockScope) => {
    const queryKey = [accountId, "filters"];
    const { rules, vacation } = await queryClient.fetchQuery({
      queryKey,
      queryFn: () => getFilters(client, accountId),
      // Fresh from Stalwart: the rules may have changed on another device.
      staleTime: 0,
    });
    const rule = blockRule(crypto.randomUUID(), address, scope, {
      id: junk.id,
      path: sievePath(junk, mailboxes),
    });
    await setFilters(client, accountId, { rules: [rule, ...rules], vacation });
    await queryClient.invalidateQueries({ queryKey });
  };
};
