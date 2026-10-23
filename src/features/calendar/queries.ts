import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import {
  createEvent,
  deleteEvent,
  listCalendars,
  queryEvents,
  respondToEvent,
  updateEvent,
} from "@/jmap/calendar";
import { CAPABILITIES } from "@/jmap/client";
import { addDays, dateKey, fromLocal } from "@/lib/jscalendar";

export const useCalendarAccountId = (): string | undefined => {
  const { data: session } = useSession();
  return session?.primaryAccounts[CAPABILITIES.calendars];
};

export const useCalendars = () => {
  const client = useClient();
  const accountId = useCalendarAccountId();
  return useQuery({
    queryKey: [accountId, "calendars"],
    queryFn: () => listCalendars(client, accountId!),
    enabled: Boolean(accountId),
  });
};

/** Events of the local days `from` … `to` (inclusive). */
export const useEvents = (from: string, to: string) => {
  const client = useClient();
  const accountId = useCalendarAccountId();
  return useQuery({
    queryKey: [accountId, "events", from, to],
    queryFn: () =>
      queryEvents(
        client,
        accountId!,
        fromLocal(`${from}T00:00:00`),
        fromLocal(`${addDays(to, 1)}T00:00:00`),
      ),
    enabled: Boolean(accountId),
    placeholderData: keepPreviousData,
  });
};

/** Today's and later events that mention an address (for the contact view). */
export const useEventsWith = (email: string | undefined) => {
  const client = useClient();
  const accountId = useCalendarAccountId();
  return useQuery({
    queryKey: [accountId, "events", "with", email],
    queryFn: () => {
      const today = fromLocal(`${dateKey(new Date())}T00:00:00`);
      return queryEvents(
        client,
        accountId!,
        today,
        new Date(today.getTime() + 180 * 86_400_000),
        email,
      );
    },
    enabled: Boolean(accountId && email),
  });
};

export const useEventMutations = () => {
  const client = useClient();
  const accountId = useCalendarAccountId();
  const queryClient = useQueryClient();
  const { data: calendars = [] } = useCalendars();
  const refresh = () => queryClient.invalidateQueries({ queryKey: [accountId] });

  return {
    create: useMutation({
      mutationFn: (event: Record<string, unknown>) => {
        const calendar = calendars.find((c) => c.isDefault) ?? calendars[0];
        if (!accountId || !calendar) throw new Error("Kein Kalender");
        return createEvent(client, accountId, calendar.id, event);
      },
      onSettled: refresh,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
        updateEvent(client, accountId!, id, patch),
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => deleteEvent(client, accountId!, id),
      onSettled: refresh,
    }),
    respond: useMutation({
      mutationFn: ({
        id,
        participantId,
        status,
      }: {
        id: string;
        participantId: string;
        status: "accepted" | "declined" | "tentative";
      }) => respondToEvent(client, accountId!, id, participantId, status),
      onSettled: refresh,
    }),
  };
};
