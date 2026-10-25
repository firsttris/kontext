/**
 * The free and busy times of an appointment's attendees, for the planning panel in the editor.
 * Colleagues are found by address among the company's people; anyone else stays unknown.
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { getAvailability } from "@/jmap/availability";
import { CAPABILITIES } from "@/jmap/client";
import type { Principal } from "@/jmap/principals";
import type { Schedule } from "@/lib/availability";
import { attendeeEmails } from "@/lib/event-form";
import { usePrincipals } from "../sharing/queries";

/** The attendee addresses of the form, lower case and each once. */
export const attendeeList = (text: string): string[] => [
  ...new Set(attendeeEmails(text).map((e) => e.toLowerCase())),
];

const colleagueByEmail = (principals: Principal[], email: string): Principal | undefined =>
  principals.find((p) => p.type === "individual" && p.email?.toLowerCase() === email);

/** One schedule per address between two instants, the user's own first. */
export const useSchedules = (emails: string[], from: Date, to: Date) => {
  const client = useClient();
  const { data: session } = useSession();
  const { data: principals = [] } = usePrincipals();
  const accountId = session?.primaryAccounts[CAPABILITIES.principals];
  const me = session?.username.toLowerCase() ?? "";
  const all = [me, ...emails.filter((e) => e !== me)].filter(Boolean);
  const ids = all.map((email) => colleagueByEmail(principals, email)?.id);
  const known = ids.filter((id): id is string => Boolean(id));

  const query = useQuery({
    queryKey: [accountId, "availability", known, from.getTime(), to.getTime()],
    queryFn: () => getAvailability(client, accountId!, known, from, to),
    // Only once there is someone to plan with, not for the user alone.
    enabled: Boolean(accountId) && emails.length > 0 && known.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const schedules: Schedule[] = all.map((email, index) => {
    const id = ids[index];
    return { email, busy: id ? (query.data?.[id] ?? []) : null };
  });
  return {
    schedules,
    me,
    names: Object.fromEntries(
      all.map((email, index) => {
        const principal = principals.find((p) => p.id === ids[index]);
        return [email, principal?.description || email];
      }),
    ) as Record<string, string>,
    isPending: query.isPending && emails.length > 0 && known.length > 0,
    isError: query.isError,
  };
};
