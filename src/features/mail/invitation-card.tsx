/**
 * The card above an invitation mail, as mail programs show one: the event, the user's answer and
 * Zusagen / Vielleicht / Absagen right there, without the answer page the buttons in the mail
 * lead to. For a cancellation, removing the event. Only in the user's own mailbox: answering in a
 * shared one would answer for the mailbox (the same rule as the calendar's own buttons).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { answerInvitation, deleteEvent, findEventByUid, parseCalendarBlob } from "@/jmap/calendar";
import { CAPABILITIES } from "@/jmap/client";
import type { EmailDetail } from "@/jmap/types";
import { eventWhen } from "@/lib/event-when";
import type { Answer } from "@/lib/invitation-mail";
import { type CalendarEvent, locationName } from "@/lib/jscalendar";
import {
  type InvitationCard as Card,
  calendarPart,
  importable,
  invitationCard,
  receivedInvitation,
} from "@/lib/received-invitation";
import { m } from "@/paraglide/messages";
import { useMyAddresses } from "../calendar/queries";
import { useIdentities } from "./queries";

const ANSWERS: [Answer, () => string][] = [
  ["accepted", m.calendar_accept],
  ["tentative", m.calendar_tentative],
  ["declined", m.calendar_decline],
];

const DONE: Record<string, () => string> = {
  accepted: m.rsvp_done_accepted,
  declined: m.rsvp_done_declined,
  tentative: m.rsvp_done_tentative,
};

/** Whether the account is the user's own and has calendars. */
const useOwnCalendarAccount = (accountId: string) => {
  const { data: session } = useSession();
  const account = session?.accounts[accountId];
  return Boolean(account?.isPersonal && CAPABILITIES.calendars in account.accountCapabilities);
};

/** The addresses that are the user here: the sign-in and every sending address of the account. */
const useMine = (accountId: string) => {
  const signIn = useMyAddresses();
  const { data: identities = [] } = useIdentities(accountId);
  return [...signIn, ...identities.map((identity) => identity.email)];
};

/** The invitation in the mail and the event in the calendar; refreshed with the calendar. */
const useInvitation = (accountId: string, email: EmailDetail) => {
  const client = useClient();
  const blobId = calendarPart(email.attachments)?.blobId;
  const enabled = useOwnCalendarAccount(accountId) && Boolean(blobId);
  return useQuery({
    queryKey: [accountId, "events", "invitation", blobId],
    queryFn: async () => {
      const received = receivedInvitation(await parseCalendarBlob(client, accountId, blobId!));
      const uid = received?.event.uid;
      const stored = uid ? await findEventByUid(client, accountId, uid) : null;
      return { received, stored };
    },
    enabled,
  });
};

const useInvitationActions = (accountId: string) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const refresh = () => queryClient.invalidateQueries({ queryKey: [accountId, "events"] });
  const onError = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");
  return {
    answer: useMutation({
      mutationFn: ({ card, status }: { card: Card; status: Answer }) =>
        answerInvitation(
          client,
          accountId,
          { storedId: card.stored?.id ?? null, event: importable(card.event) },
          card.me![0],
          status,
        ),
      onError,
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: (stored: CalendarEvent) =>
        deleteEvent(client, accountId, stored.id, { sendSchedulingMessages: false }),
      onSuccess: () => toast.show(m.mail_invitation_removed()),
      onError,
      onSettled: refresh,
    }),
  };
};

/** The calendar on the event's day with the event open (calendar-page.tsx finds it by its id). */
const CalendarLink = ({ stored }: { stored: CalendarEvent }) => (
  <Link
    to="/calendar"
    search={{ date: stored.start.slice(0, 10), event: stored.id }}
    className="self-start text-[13px] text-accent hover:underline"
  >
    {m.mail_invitation_open_calendar()}
  </Link>
);

export const InvitationCard = ({ accountId, email }: { accountId: string; email: EmailDetail }) => {
  const { data } = useInvitation(accountId, email);
  const mine = useMine(accountId);
  const { answer, remove } = useInvitationActions(accountId);
  const card = data ? invitationCard({ ...data, mine }) : null;
  if (!card) return null;
  const { event, stored } = card;
  const status = card.me?.[1].participationStatus;
  const done = stored && status ? DONE[status] : undefined;
  const place = locationName(event as CalendarEvent);

  return (
    <section
      aria-label={m.mail_invitation_region()}
      className="flex flex-col gap-3 rounded-xl border border-border p-4"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
          <CalendarDays size={18} aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12px] text-muted">
            {card.kind === "cancel"
              ? m.invitation_heading_cancel({ name: card.organizer })
              : m.rsvp_from({ name: card.organizer })}
          </span>
          <span
            className={
              card.kind === "cancel"
                ? "font-semibold break-words text-muted line-through"
                : "font-semibold break-words"
            }
          >
            {event.title || m.invitation_untitled()}
          </span>
          <span className="text-[13px] text-muted">{eventWhen(event)}</span>
          {place ? <span className="text-[13px] break-words text-muted">{place}</span> : null}
        </div>
      </div>
      {card.outdated ? (
        <p className="m-0 text-[13px] text-muted">{m.mail_invitation_outdated()}</p>
      ) : null}
      {card.kind === "cancel" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="m-0 flex-1 text-[13px] text-muted">
            {stored ? m.mail_invitation_still_there() : m.mail_invitation_not_there()}
          </p>
          {card.canRemove && stored ? (
            <Button
              variant="outline"
              size="sm"
              disabled={remove.isPending}
              onClick={() => remove.mutate(stored)}
            >
              {m.mail_invitation_remove()}
            </Button>
          ) : null}
        </div>
      ) : card.canAnswer ? (
        <div className="flex flex-col gap-2">
          <p role="status" className="m-0 text-[13px] font-medium">
            {done ? done() : stored ? m.rsvp_open() : m.mail_invitation_not_in_calendar()}
          </p>
          <fieldset aria-label={m.rsvp_question()} className="m-0 flex gap-2 border-0 p-0">
            {ANSWERS.map(([value, label]) => (
              <Button
                key={value}
                variant={stored && status === value ? "primary" : "outline"}
                aria-pressed={Boolean(stored) && status === value}
                disabled={answer.isPending}
                className="flex-1 sm:flex-none"
                onClick={() => answer.mutate({ card, status: value })}
              >
                {label()}
              </Button>
            ))}
          </fieldset>
        </div>
      ) : null}
      {stored && card.kind === "request" ? <CalendarLink stored={stored} /> : null}
    </section>
  );
};
