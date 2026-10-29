/**
 * The line above a mail that carries an invitation (Outlook, Google, Apple, a colleague): what and
 * when, whether it is in the calendar, and Zusagen / Vielleicht / Absagen or "In den Kalender";
 * for a called-off one "Aus dem Kalender entfernen" (src/lib/mail-invitation.ts).
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useCalendarRefs } from "@/features/calendar/queries";
import {
  addInvitation,
  answerInvitation,
  findEventByUid,
  parseInvitation,
  removeCancelled,
} from "@/jmap/mail-invitations";
import type { EmailDetail } from "@/jmap/types";
import { eventWhen } from "@/lib/event-when";
import type { ReplyStatus } from "@/lib/invitation-reply";
import { dateKey, eventTimes, locationName, participantEmail } from "@/lib/jscalendar";
import { invitationPart, invitationView, organizerEmail } from "@/lib/mail-invitation";
import { m } from "@/paraglide/messages";
import { useIdentities } from "./queries";

const ANSWERS: [ReplyStatus, () => string][] = [
  ["accepted", m.calendar_accept],
  ["tentative", m.calendar_tentative],
  ["declined", m.calendar_decline],
];

const STATUS: Record<string, () => string> = {
  "needs-action": m.mail_invitation_open_answer,
  accepted: m.mail_invitation_accepted,
  tentative: m.mail_invitation_tentative,
  declined: m.mail_invitation_declined,
};

export const InvitationBar = ({ accountId, email }: { accountId: string; email: EmailDetail }) => {
  const part = invitationPart(email.attachments);
  return part?.blobId ? <Bar accountId={accountId} blobId={part.blobId} key={part.blobId} /> : null;
};

const Bar = ({ accountId, blobId }: { accountId: string; blobId: string }) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const { data: identities = [] } = useIdentities(accountId);
  const { calendars } = useCalendarRefs();
  const target =
    calendars.find((c) => c.accountId === accountId && c.mayWrite && c.calendar.isDefault) ??
    calendars.find((c) => c.accountId === accountId && c.mayWrite);
  const { data: parsed } = useQuery({
    queryKey: [accountId, "invitation", blobId],
    queryFn: () => parseInvitation(client, accountId, blobId),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const uid = parsed?.uid;
  // Under the account's "events" key: a change in the calendar refreshes the line.
  const { data: stored } = useQuery({
    queryKey: [accountId, "events", "uid", uid],
    queryFn: () => findEventByUid(client, accountId, uid!),
    enabled: Boolean(uid),
  });
  const addresses = identities.map((identity) => identity.email);
  const view = invitationView(parsed ?? undefined, stored ?? undefined, addresses);
  if (!parsed || view.kind === "none") return null;

  const shown = stored ?? parsed;
  const organizer = organizerEmail(parsed);
  const organizerName =
    Object.values(parsed.participants ?? {}).find(
      (participant) => participantEmail(participant).toLowerCase() === organizer,
    )?.name || organizer;
  const place = locationName(shown);
  const day = dateKey(eventTimes(shown).start);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: [accountId, "events"] });
      toast.show(done);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };
  const answer = (status: ReplyStatus) =>
    target &&
    run(
      () =>
        answerInvitation(client, {
          accountId,
          calendarId: target.calendar.id,
          parsed,
          stored: stored ?? null,
          status,
          identities,
        }),
      m.mail_invitation_answered({ name: organizerName }),
    );

  return (
    <section
      aria-label={m.mail_invitation()}
      className="flex flex-col gap-3 rounded-lg border border-border px-4 py-3 text-[14px]"
    >
      <div className="flex items-start gap-3">
        <CalendarDays size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12px] text-muted">
            {view.kind === "cancel"
              ? m.mail_invitation_cancelled({ name: organizerName })
              : m.mail_invitation_from({ name: organizerName })}
          </span>
          <span className="font-medium">{shown.title || m.invitation_untitled()}</span>
          <span className="text-[13px] text-muted">
            {eventWhen(shown)}
            {place ? ` · ${place}` : ""}
          </span>
          {view.kind === "request" && view.status ? (
            <span className="text-[13px]">{STATUS[view.status]?.() ?? ""}</span>
          ) : null}
          {(view.kind === "request" || view.kind === "cancel") && view.outdated ? (
            <span className="text-[13px] text-muted">{m.mail_invitation_outdated()}</span>
          ) : null}
          {view.inCalendar ? (
            <Link
              to="/calendar"
              search={{ date: day }}
              className="self-start text-[13px] text-accent underline-offset-2 hover:underline"
            >
              {m.mail_invitation_in_calendar()}
            </Link>
          ) : null}
        </div>
      </div>
      {target ? (
        <div className="flex flex-wrap gap-2">
          {view.kind === "request" && view.status
            ? ANSWERS.map(([status, label]) => (
                <Button
                  key={status}
                  size="sm"
                  variant={view.status === status ? "primary" : "outline"}
                  aria-pressed={view.status === status}
                  disabled={busy}
                  onClick={() => void answer(status)}
                >
                  {label()}
                </Button>
              ))
            : null}
          {view.kind !== "cancel" && !view.inCalendar ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(
                  () => addInvitation(client, accountId, target.calendar.id, parsed),
                  m.mail_invitation_added(),
                )
              }
            >
              {m.mail_invitation_add()}
            </Button>
          ) : null}
          {view.kind === "cancel" && stored && !view.outdated ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(
                  () => removeCancelled(client, accountId, stored, parsed),
                  m.mail_invitation_removed(),
                )
              }
            >
              {m.mail_invitation_remove()}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
