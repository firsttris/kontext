/**
 * The page behind the buttons Ja / Nein / Vielleicht of an invitation Kontext sent
 * (/rsvp?t=<token>&r=<answer>): for attendees without an account. It shows the event as the
 * invitation did and enters the answer from the link right away; the answer can be changed here.
 * The answer is sent from the page (not by opening the link), so a mail scanner that opens links
 * answers nothing.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { eventWhen } from "@/lib/event-when";
import type { Answer } from "@/lib/invitation-mail";
import { type CalendarEvent, locationName } from "@/lib/jscalendar";
import { describeRecurrence } from "@/lib/recurrence";
import { m } from "@/paraglide/messages";

type View = {
  event: Omit<CalendarEvent, "id" | "calendarIds">;
  organizer: { name: string | null; email: string };
  people: { name: string | null; email: string; status: string; organizer: boolean }[];
  me: { email: string; status: string };
};

type Problem = "invalid" | "too-many" | "gone" | "not-invited" | string;

const PROBLEMS: Record<string, () => string> = {
  invalid: m.rsvp_invalid,
  "too-many": m.rsvp_too_many,
  gone: m.rsvp_gone,
  "not-invited": m.rsvp_not_invited,
};

const DONE: Record<string, () => string> = {
  accepted: m.rsvp_done_accepted,
  declined: m.rsvp_done_declined,
  tentative: m.rsvp_done_tentative,
};

const ANSWERS: [Answer, () => string][] = [
  ["accepted", m.invitation_yes],
  ["declined", m.invitation_no],
  ["tentative", m.invitation_maybe],
];

const STATUS: Record<string, () => string> = {
  accepted: m.calendar_status_accepted,
  declined: m.calendar_status_declined,
  tentative: m.calendar_status_tentative,
  "needs-action": m.calendar_status_needs_action,
};

const request = async (token: string, answer?: Answer): Promise<View> => {
  const response = answer
    ? await fetch("/api/rsvp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ t: token, status: answer }),
      })
    : await fetch(`/api/rsvp?t=${encodeURIComponent(token)}`);
  const body = (await response.json().catch(() => ({}))) as View & { error?: Problem };
  if (!response.ok) throw new Error(body.error ?? String(response.status));
  return body;
};

const problemText = (error: Error) =>
  PROBLEMS[error.message]?.() ?? m.rsvp_failed({ message: error.message });

const Frame = ({ children }: { children: ReactNode }) => (
  <div className="min-h-dvh bg-side px-4 py-8 md:py-14">
    <main className="mx-auto flex max-w-[560px] flex-col gap-5 rounded-2xl border border-border bg-bg p-5 shadow-sm md:p-8">
      {children}
    </main>
    <p className="mx-auto mt-4 max-w-[560px] text-center text-[12px] text-muted">
      {m.rsvp_footer()}
    </p>
  </div>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex gap-3 text-[14px]">
    <dt className="w-24 shrink-0 text-[12px] leading-5 text-muted">{label}</dt>
    <dd className="m-0 min-w-0 flex-1 whitespace-pre-line break-words">{children}</dd>
  </div>
);

const videoOf = (event: View["event"]) =>
  Object.values(event.virtualLocations ?? {})
    .map((place) => place.uri ?? "")
    .find((uri) => /^https?:\/\//i.test(uri)) ?? "";

const Details = ({ view }: { view: View }) => {
  const { event } = view;
  const repeat = describeRecurrence(event.recurrenceRule);
  const place = locationName(event as CalendarEvent);
  const video = videoOf(event);
  return (
    <dl className="m-0 flex flex-col gap-2">
      <Row label={m.invitation_label_when()}>{eventWhen(event)}</Row>
      {repeat ? <Row label={m.invitation_label_repeat()}>{repeat}</Row> : null}
      {place ? <Row label={m.invitation_label_where()}>{place}</Row> : null}
      {video ? (
        <Row label={m.invitation_label_video()}>
          <a href={video} className="underline" target="_blank" rel="noreferrer">
            {m.invitation_video_join()}
          </a>
        </Row>
      ) : null}
      <Row label={m.invitation_label_people()}>
        <ul aria-label={m.invitation_label_people()} className="m-0 flex list-none flex-col p-0">
          {view.people.map((person) => (
            <li key={person.email}>
              {person.name || person.email}
              <span className="text-muted">
                {" "}
                · {person.organizer ? m.invitation_organizer() : STATUS[person.status]?.()}
              </span>
            </li>
          ))}
        </ul>
      </Row>
      {event.description ? <Row label={m.invitation_label_notes()}>{event.description}</Row> : null}
    </dl>
  );
};

export const RsvpPage = ({ token, answer }: { token: string; answer?: Answer }) => {
  const first = useQuery({
    queryKey: ["rsvp", token, answer],
    queryFn: () => request(token, answer),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  const change = useMutation({ mutationFn: (next: Answer) => request(token, next) });
  const view = change.data ?? first.data;

  if (first.isError) {
    return (
      <Frame>
        <h1 className="m-0 text-[20px] font-semibold">{m.rsvp_title()}</h1>
        <p role="alert" className="m-0 text-[14px] text-muted">
          {problemText(first.error)}
        </p>
      </Frame>
    );
  }
  if (!view) {
    return <Frame>{answer ? m.rsvp_saving() : m.rsvp_loading()}</Frame>;
  }
  const organizer = view.organizer.name || view.organizer.email;
  const done = DONE[view.me.status];
  return (
    <Frame>
      <header className="flex flex-col gap-1">
        <p className="m-0 text-[13px] text-muted">{m.rsvp_from({ name: organizer })}</p>
        <h1 className="m-0 text-[20px] font-semibold">
          {view.event.title || m.invitation_untitled()}
        </h1>
      </header>
      <Details view={view} />
      <section
        aria-label={m.rsvp_question()}
        className="flex flex-col gap-3 rounded-xl bg-subtle p-4"
      >
        <p role="status" className="m-0 text-[15px] font-semibold">
          {done ? done() : m.rsvp_open()}
        </p>
        {done ? (
          <p className="m-0 text-[13px] text-muted">{m.rsvp_told({ name: organizer })}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted">
            {done ? m.rsvp_change() : m.rsvp_question()}
          </span>
          {ANSWERS.map(([value, label]) => (
            <Button
              key={value}
              variant={view.me.status === value ? "primary" : "outline"}
              aria-pressed={view.me.status === value}
              disabled={change.isPending}
              onClick={() => change.mutate(value)}
            >
              {label()}
            </Button>
          ))}
        </div>
        {change.isError ? (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {problemText(change.error)}
          </p>
        ) : null}
      </section>
    </Frame>
  );
};
