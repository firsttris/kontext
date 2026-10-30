/**
 * The members of the user's shared mailboxes (server/company/mailbox-members.ts), for "Zuweisen".
 * Without the server, or when it fails, nothing is known and the menu offers everyone.
 */
import { useQuery } from "@tanstack/react-query";

export const getMailboxMembers = async (): Promise<Record<string, string[]>> => {
  const response = await fetch("/api/company/mailbox-members", { credentials: "same-origin" });
  if (!response.ok) return {};
  return ((await response.json()) as { members: Record<string, string[]> }).members;
};

/** The member ids of the shared mailbox `accountId`, or undefined while not known. */
export const useMailboxMembers = (accountId: string): string[] | undefined =>
  useQuery({
    queryKey: ["company", "mailbox-members"],
    queryFn: getMailboxMembers,
    staleTime: 5 * 60_000,
    retry: false,
  }).data?.[accountId];
