/**
 * The invitation mail Kontext sends in the organizer's name instead of Stalwart's (RFC 6047 iMIP):
 * HTML in Kontext's look with the event and the buttons Ja / Nein / Vielleicht, the same as text,
 * and the iCalendar object as text/calendar with its method, plus as a file. Mail programs show
 * their own buttons for the text/calendar part; the buttons in the HTML lead to Kontext's page
 * for answering without an account. Inline styles and tables only, as mail programs want. Pure.
 */
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { eventWhen } from "./event-when";
import { escapeHtml } from "./html";
import type { InvitationKind } from "./invitation-plan";
import { toICalendar } from "./itip";
import { type CalendarEvent, locationName, type Participant, participantEmail } from "./jscalendar";
import { attachmentPart, type Envelope, multipart, textPart, withHeaders } from "./mime";
import { describeRecurrence } from "./recurrence";

export type Answer = "accepted" | "declined" | "tentative";
/** The page for each answer (Kontext's /rsvp with the attendee's signed token). */
export type AnswerLinks = Record<Answer, string>;

export type InvitationMail = {
  kind: InvitationKind;
  event: CalendarEvent;
  organizer: { name: string | null; email: string };
  recipient: { name: string | null; email: string };
  /** Null: no buttons (without the server's key no answer can be entered). */
  links: AnswerLinks | null;
  now: Date;
  /** Unique; goes into the Message-ID and the MIME boundaries. */
  id: string;
};

/** The zinc tokens of the app (src/styles.css), written out for mail programs. */
const C = {
  page: "#f4f4f5",
  card: "#ffffff",
  border: "#e4e4e7",
  fg: "#09090b",
  muted: "#71717a",
  primary: "#18181b",
  onPrimary: "#fafafa",
  danger: "#b91c1c",
} as const;
const FONT = "Geist, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const SUBJECT: Record<InvitationKind, (title: string) => string> = {
  invite: (title) => m.invitation_subject_invite({ title }),
  update: (title) => m.invitation_subject_update({ title }),
  cancel: (title) => m.invitation_subject_cancel({ title }),
  removed: (title) => m.invitation_subject_cancel({ title }),
};

const HEADING: Record<InvitationKind, (name: string) => string> = {
  invite: (name) => m.invitation_heading_invite({ name }),
  update: (name) => m.invitation_heading_update({ name }),
  cancel: (name) => m.invitation_heading_cancel({ name }),
  removed: (name) => m.invitation_heading_removed({ name }),
};

const titleOf = (event: CalendarEvent) => event.title || m.invitation_untitled();

export const invitationSubject = (kind: InvitationKind, event: CalendarEvent) =>
  SUBJECT[kind](titleOf(event));

const isCancel = (kind: InvitationKind) => kind === "cancel" || kind === "removed";

/** Only web addresses become links: an invitation from elsewhere could hold `javascript:`. */
const webLink = (uri: string | undefined) => (uri && /^https?:\/\//i.test(uri) ? uri : "");

const videoLink = (event: CalendarEvent) =>
  Object.values(event.virtualLocations ?? {})
    .map((place) => webLink(place.uri))
    .find(Boolean) ?? "";

const personLabel = (participant: Participant) => participant.name || participantEmail(participant);

/** Everyone who comes, the organizer first and marked. */
const people = (event: CalendarEvent): string[] => {
  const organizer = (event.organizerCalendarAddress ?? "").replace(/^mailto:/i, "").toLowerCase();
  const all = Object.values(event.participants ?? {}).filter(
    (participant) => participantEmail(participant) && participant.roles?.attendee !== false,
  );
  const isOrganizer = (participant: Participant) =>
    participantEmail(participant).toLowerCase() === organizer;
  return [
    ...all.filter(isOrganizer).map((p) => `${personLabel(p)} (${m.invitation_organizer()})`),
    ...all.filter((p) => !isOrganizer(p)).map(personLabel),
  ];
};

type Row = { label: string; text: string; href?: string };

const rows = (event: CalendarEvent): Row[] => {
  const repeat = describeRecurrence(event.recurrenceRule);
  const place = locationName(event);
  const video = videoLink(event);
  const who = people(event);
  return [
    { label: m.invitation_label_when(), text: eventWhen(event) },
    ...(repeat ? [{ label: m.invitation_label_repeat(), text: repeat }] : []),
    ...(place ? [{ label: m.invitation_label_where(), text: place }] : []),
    ...(video
      ? [{ label: m.invitation_label_video(), text: m.invitation_video_join(), href: video }]
      : []),
    ...(who.length ? [{ label: m.invitation_label_people(), text: who.join("\n") }] : []),
    ...(event.description ? [{ label: m.invitation_label_notes(), text: event.description }] : []),
  ];
};

const BUTTONS: [Answer, () => string][] = [
  ["accepted", m.invitation_yes],
  ["declined", m.invitation_no],
  ["tentative", m.invitation_maybe],
];

const organizerName = (mail: InvitationMail) => mail.organizer.name || mail.organizer.email;

export const invitationText = (mail: InvitationMail): string => {
  const { event, kind, links } = mail;
  return [
    HEADING[kind](organizerName(mail)),
    "",
    titleOf(event),
    "",
    ...rows(event).map(
      (row) =>
        `${row.label}: ${row.href ? `${row.text} ${row.href}` : row.text.replace(/\n/g, "\n  ")}`,
    ),
    ...(links && !isCancel(kind)
      ? [
          "",
          m.invitation_answer(),
          ...BUTTONS.map(([answer, label]) => `${label()}: ${links[answer]}`),
          m.invitation_answer_elsewhere(),
        ]
      : []),
    "",
    m.invitation_footer({ name: organizerName(mail), email: mail.organizer.email }),
  ].join("\n");
};

const html = (text: string) => escapeHtml(text).replace(/\r?\n/g, "<br>");

const rowHtml = (row: Row) =>
  `<tr><td valign="top" style="padding:6px 12px 6px 0;width:96px;font-size:12px;line-height:20px;color:${C.muted};">${html(row.label)}</td><td style="padding:6px 0;font-size:14px;line-height:20px;color:${C.fg};">${
    row.href
      ? `<a href="${escapeHtml(row.href)}" style="color:${C.fg};text-decoration:underline;">${html(row.text)}</a>`
      : html(row.text)
  }</td></tr>`;

const button = (href: string, label: string, primary: boolean) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:8px 18px;border-radius:8px;border:1px solid ${primary ? C.primary : C.border};background:${primary ? C.primary : C.card};color:${primary ? C.onPrimary : C.fg};font-size:14px;font-weight:600;line-height:20px;text-decoration:none;">${html(label)}</a>`;

export const invitationHtml = (mail: InvitationMail): string => {
  const { event, kind, links } = mail;
  const cancelled = isCancel(kind);
  const answers =
    links && !cancelled
      ? `<tr><td style="padding:20px 24px 4px;"><p style="margin:0 0 10px;font-size:14px;font-weight:600;color:${C.fg};">${html(m.invitation_answer())}</p>${BUTTONS.map(
          ([answer, label], index) => button(links[answer], label(), index === 0),
        ).join(
          "",
        )}<p style="margin:4px 0 0;font-size:12px;line-height:18px;color:${C.muted};">${html(m.invitation_answer_elsewhere())}</p></td></tr>`
      : "";
  return `<!doctype html>
<html lang="${getLocale()}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${html(invitationSubject(kind, event))}</title></head>
<body style="margin:0;padding:0;background:${C.page};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${C.card};border:1px solid ${C.border};border-radius:12px;font-family:${FONT};color:${C.fg};">
<tr><td style="padding:24px 24px 8px;">
<p style="margin:0 0 6px;font-size:13px;line-height:18px;color:${cancelled ? C.danger : C.muted};">${html(HEADING[kind](organizerName(mail)))}</p>
<h1 style="margin:0;font-size:20px;line-height:28px;font-weight:600;color:${C.fg};${cancelled ? "text-decoration:line-through;" : ""}">${html(titleOf(event))}</h1>
</td></tr>
<tr><td style="padding:8px 24px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows(event).map(rowHtml).join("")}</table></td></tr>
${answers}
<tr><td style="padding:16px 24px 20px;"><p style="margin:12px 0 0;padding-top:12px;border-top:1px solid ${C.border};font-size:12px;line-height:18px;color:${C.muted};">${html(m.invitation_footer({ name: organizerName(mail), email: mail.organizer.email }))}</p></td></tr>
</table>
</td></tr></table>
</body></html>`;
};

/**
 * The whole mail: mixed (alternative (text, HTML, text/calendar with the method), the same
 * iCalendar as invite.ics), as Google and Stalwart lay it out.
 */
export const invitationMessage = (mail: InvitationMail): string => {
  const method = isCancel(mail.kind) ? "CANCEL" : "REQUEST";
  const ics = toICalendar(mail.event, {
    method,
    now: mail.now,
    ...(mail.kind === "removed" ? { only: [mail.recipient.email] } : {}),
  });
  const envelope: Envelope = {
    from: mail.organizer,
    to: [mail.recipient],
    cc: [],
    subject: invitationSubject(mail.kind, mail.event),
    date: mail.now,
    messageId: `${mail.id}@${mail.organizer.email.split("@")[1] ?? "kontext"}`,
  };
  const body = multipart("mixed", `mix-${mail.id}`, [
    multipart("alternative", `alt-${mail.id}`, [
      textPart("text/plain", invitationText(mail)),
      textPart("text/html", invitationHtml(mail)),
      textPart(`text/calendar; method=${method}`, ics),
    ]),
    attachmentPart({
      name: "invite.ics",
      type: "application/ics",
      bytes: new TextEncoder().encode(ics),
    }),
  ]);
  return withHeaders(envelope, body);
};
