/**
 * Calendars and events of every account the user can see: the own one, shared mailboxes like
 * info@, and colleagues who shared a calendar. Each event carries the account it came from.
 */
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import {
  type Calendar,
  createCalendar,
  deleteCalendar,
  getEvent,
  listCalendars,
  queryEvents,
  respondToEvent,
  updateCalendar,
} from "@/jmap/calendar";
import { CAPABILITIES } from "@/jmap/client";
import { type AnswerLinksOf, type EventChange, saveEvent } from "@/jmap/invitations";
import { principalName } from "@/jmap/principals";
import {
  addDays,
  type CalendarEvent,
  dateKey,
  eventKey,
  fromLocal,
  isOrganizer,
  myParticipation,
} from "@/lib/jscalendar";
import type { ShareWith } from "@/lib/sharing";
import { m } from "@/paraglide/messages";
import { usePrincipals } from "../sharing/queries";
import { useHiddenCalendars } from "./hidden-calendars";

/** A calendar together with the account it lives in. */
export type CalendarRef = {
  /** `accountId:calendarId`, unique across accounts. */
  key: string;
  accountId: string;
  isPersonal: boolean;
  /** Who it belongs to: a colleague's name or a shared mailbox by its address. */
  owner: string;
  /** The owner's address; counts as organizer when the user edits a colleague's calendar. */
  ownerEmail: string;
  name: string;
  color: string;
  calendar: Calendar;
  mayWrite: boolean;
  /** Shown in the views; the user hides calendars per device. */
  visible: boolean;
};

export const useCalendarAccountId = (): string | undefined => {
  const { data: session } = useSession();
  return session?.primaryAccounts[CAPABILITIES.calendars];
};

/** The addresses that count as "me" in participant lists. */
export const useMyAddresses = (): string[] => {
  const { data: session } = useSession();
  return session ? [session.username] : [];
};

const useCalendarAccounts = () => {
  const { data: session } = useSession();
  if (!session) return [];
  return Object.entries(session.accounts)
    .filter(([, account]) => CAPABILITIES.calendars in account.accountCapabilities)
    .map(([id, account]) => ({ id, ...account }))
    .sort((a, b) => Number(b.isPersonal) - Number(a.isPersonal) || a.name.localeCompare(b.name));
};

/** Stalwart names the default calendar "Stalwart Calendar (…)"; the app calls it by its owner. */
const calendarName = (calendar: Calendar, own: boolean, owner: string): string =>
  /^Stalwart Calendar/.test(calendar.name) ? (own ? m.calendar_mine() : owner) : calendar.name;

/** A colour per calendar when the user has not picked one. */
const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#db2777"];

export const listKey = (accountId: string) => [accountId, "calendars"] as const;

/** All calendars the user can read: own ones first, then shared mailboxes and colleagues. */
export const useCalendarRefs = (): { calendars: CalendarRef[]; isPending: boolean } => {
  const client = useClient();
  const accounts = useCalendarAccounts();
  const { data: principals = [] } = usePrincipals();
  const hidden = useHiddenCalendars();
  const results = useQueries({
    queries: accounts.map((account) => ({
      queryKey: listKey(account.id),
      queryFn: () => listCalendars(client, account.id),
    })),
  });
  let index = 0;
  const calendars = accounts.flatMap((account, position) => {
    const principal = principals.find((p) => p.id === account.id);
    const owner = principal && principal.type !== "group" ? principalName(principal) : account.name;
    return (results[position]?.data ?? [])
      .filter((calendar) => account.isPersonal || calendar.myRights?.mayReadItems)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
      .map(
        (calendar): CalendarRef => ({
          key: `${account.id}:${calendar.id}`,
          accountId: account.id,
          isPersonal: account.isPersonal,
          owner,
          ownerEmail: principal?.email ?? account.name,
          name: calendarName(calendar, account.isPersonal, owner),
          color: calendar.color ?? PALETTE[index++ % PALETTE.length]!,
          calendar,
          mayWrite: account.isPersonal || Boolean(calendar.myRights?.mayWriteAll),
          visible: !hidden.has(`${account.id}:${calendar.id}`),
        }),
      );
  });
  return { calendars, isPending: results.some((result) => result.isPending) };
};

/** "Baustellen · Jonas Weber"; own calendars and colleagues' default ones by their name alone. */
export const calendarLabel = (calendar: CalendarRef): string =>
  calendar.isPersonal || calendar.name === calendar.owner
    ? calendar.name
    : m.calendar_of({ calendar: calendar.name, owner: calendar.owner });

/** The calendar an event is in (the first visible one it belongs to). */
export const calendarOf = (
  calendars: CalendarRef[],
  event: CalendarEvent,
): CalendarRef | undefined =>
  calendars.find(
    (calendar) => calendar.accountId === event.accountId && event.calendarIds[calendar.calendar.id],
  );

/**
 * An invitation still waiting for the user's answer. Only the user's own calendar holds
 * invitations to answer; a colleague's shared calendar holds theirs.
 */
export const isInvitation = (
  calendars: CalendarRef[],
  event: CalendarEvent,
  mine: string[],
): boolean => {
  if (!calendarOf(calendars, event)?.isPersonal) return false;
  const me = myParticipation(event, mine);
  return Boolean(me && !isOrganizer(event, mine) && me[1].participationStatus === "needs-action");
};

/**
 * May the user change the event? In a writable calendar, if they or the calendar's owner organize
 * it (invitations from others are answered, not edited).
 */
export const mayEdit = (
  calendar: CalendarRef | undefined,
  event: CalendarEvent,
  myAddresses: string[],
): boolean =>
  Boolean(calendar?.mayWrite) && isOrganizer(event, [...myAddresses, calendar!.ownerEmail]);

/** The URL search that opens an event. */
export const eventSearch = (event: CalendarEvent) => ({
  event: event.id,
  account: event.accountId,
});

/** Events of the local days `from` … `to` (inclusive) in the visible calendars. */
export const useEvents = (from: string, to: string) => {
  const client = useClient();
  const { calendars, isPending: calendarsPending } = useCalendarRefs();
  const shown = calendars.filter((calendar) => calendar.visible);
  const results = useQueries({
    queries: shown.map((calendar) => ({
      queryKey: [calendar.accountId, "events", calendar.calendar.id, from, to],
      queryFn: () =>
        queryEvents(
          client,
          calendar.accountId,
          fromLocal(`${from}T00:00:00`),
          fromLocal(`${addDays(to, 1)}T00:00:00`),
          { calendarId: calendar.calendar.id },
        ),
      placeholderData: keepPreviousData,
    })),
  });
  const seen = new Set<string>();
  const events: CalendarEvent[] = [];
  shown.forEach((calendar, index) => {
    for (const event of results[index]?.data ?? []) {
      const loaded = { ...event, accountId: calendar.accountId, color: calendar.color };
      if (seen.has(eventKey(loaded))) continue;
      seen.add(eventKey(loaded));
      events.push(loaded);
    }
  });
  return {
    data: events,
    calendars,
    isPending: calendarsPending || results.some((result) => result.isPending),
  };
};

/** Today's and later events of the own calendars that mention an address (contact view). */
export const useEventsWith = (email: string | undefined) => {
  const client = useClient();
  const accountId = useCalendarAccountId();
  return useQuery({
    queryKey: [accountId, "events", "with", email],
    queryFn: async () => {
      const today = fromLocal(`${dateKey(new Date())}T00:00:00`);
      const events = await queryEvents(
        client,
        accountId!,
        today,
        new Date(today.getTime() + 180 * 86_400_000),
        { text: email },
      );
      return events.map((event) => ({ ...event, accountId }));
    },
    enabled: Boolean(accountId && email),
  });
};

/** The series an instance belongs to; holds the rule the editor shows. */
export const useSeries = (event: CalendarEvent | undefined) => {
  const client = useClient();
  const accountId = event?.accountId;
  const baseEventId = event?.baseEventId;
  return useQuery({
    queryKey: [accountId, "events", "series", baseEventId],
    queryFn: () => getEvent(client, accountId!, baseEventId!),
    enabled: Boolean(accountId && baseEventId),
  });
};

/** The pages on which attendees answer, signed by Kontext's server (/api/invitations). */
const answerLinksOf: AnswerLinksOf = async (accountId, eventId) => {
  const response = await fetch("/api/invitations/links", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountId, eventId }),
  });
  if (!response.ok) return {};
  return ((await response.json()) as { links: Awaited<ReturnType<AnswerLinksOf>> }).links;
};

export const useEventMutations = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const refresh = (accountId: string | undefined) =>
    queryClient.invalidateQueries({ queryKey: [accountId, "events"] });
  const account = (event: CalendarEvent) => event.accountId!;
  const save = (accountId: string, change: EventChange) =>
    saveEvent(client, accountId, change, answerLinksOf);

  return {
    create: useMutation({
      mutationFn: ({
        event,
        calendar,
      }: {
        event: Record<string, unknown>;
        calendar: CalendarRef;
      }) => save(calendar.accountId, { kind: "create", calendarId: calendar.calendar.id, event }),
      onSettled: (_data, _error, { calendar }) => refresh(calendar.accountId),
    }),
    update: useMutation({
      mutationFn: ({
        event,
        id,
        patch,
      }: {
        event: CalendarEvent;
        /** The instance or series to change; defaults to the event itself. */
        id?: string;
        patch: Record<string, unknown>;
      }) => save(account(event), { kind: "update", id: id ?? event.id, patch }),
      onSettled: (_data, _error, { event }) => refresh(account(event)),
    }),
    /** Drag in the grid: shown at once, saved in the background. */
    move: useMutation({
      mutationFn: ({
        event,
        patch,
      }: {
        event: CalendarEvent;
        patch: Record<string, unknown>;
        start: Date;
        end: Date;
      }) => save(account(event), { kind: "update", id: event.id, patch }),
      onMutate: async ({ event, start, end }) => {
        const queryKey = [account(event), "events"];
        await queryClient.cancelQueries({ queryKey });
        queryClient.setQueriesData<CalendarEvent[]>({ queryKey }, (list) =>
          Array.isArray(list)
            ? list.map((item) =>
                item.id === event.id
                  ? { ...item, utcStart: start.toISOString(), utcEnd: end.toISOString() }
                  : item,
              )
            : list,
        );
      },
      onSettled: (_data, _error, { event }) => refresh(account(event)),
    }),
    remove: useMutation({
      mutationFn: ({ event, id }: { event: CalendarEvent; id?: string }) =>
        save(account(event), { kind: "destroy", id: id ?? event.id }),
      onSettled: (_data, _error, { event }) => refresh(account(event)),
    }),
    respond: useMutation({
      mutationFn: ({
        event,
        participantId,
        status,
      }: {
        event: CalendarEvent;
        participantId: string;
        status: "accepted" | "declined" | "tentative";
      }) => respondToEvent(client, account(event), event.id, participantId, status),
      onSettled: (_data, _error, { event }) => refresh(account(event)),
    }),
  };
};

export const useCalendarMutations = () => {
  const client = useClient();
  const accountId = useCalendarAccountId();
  const queryClient = useQueryClient();
  const refresh = (account: string) =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey(account) }),
      queryClient.invalidateQueries({ queryKey: [account, "events"] }),
    ]);

  const createOne = useMutation({
    mutationFn: (name: string) => createCalendar(client, accountId!, { name }),
    onSettled: () => refresh(accountId!),
  });
  const deleteOne = useMutation({
    mutationFn: (calendar: CalendarRef) =>
      deleteCalendar(client, calendar.accountId, calendar.calendar.id),
    onSettled: (_data, _error, calendar) => refresh(calendar.accountId),
  });
  const share = useMutation({
    mutationFn: ({
      calendar,
      shareWith,
      includeInAvailability,
    }: {
      calendar: CalendarRef;
      shareWith: ShareWith;
      includeInAvailability?: boolean;
    }) =>
      updateCalendar(client, calendar.accountId, calendar.calendar.id, {
        shareWith,
        ...(includeInAvailability === undefined
          ? {}
          : { includeInAvailability: includeInAvailability ? "all" : "none" }),
      }),
    onSettled: (_data, _error, { calendar }) => refresh(calendar.accountId),
  });
  return { createOne, deleteOne, share };
};
