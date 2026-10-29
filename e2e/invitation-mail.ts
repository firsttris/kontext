import { deliverMail } from "./protocols";

export const PETRA = "petra@keller-elektro.test";

/** A week ahead, at 10:00 in Berlin, as iCalendar's local form. */
const nextWeek = () => {
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + 7 * 86_400_000),
  );
  return day.replace(/-/g, "");
};

/** An invitation as Outlook sends it from outside: text and the iCalendar part with its method. */
export const deliverInvitation = (
  to: string,
  {
    uid,
    title,
    method = "REQUEST",
    sequence = 0,
  }: {
    uid: string;
    title: string;
    method?: "REQUEST" | "CANCEL";
    sequence?: number;
  },
) => {
  const day = nextWeek();
  const ics = [
    "BEGIN:VCALENDAR",
    "PRODID:Microsoft Exchange Server 2010",
    "VERSION:2.0",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `ORGANIZER;CN=Petra Keller:mailto:${PETRA}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=Jonas Weber:mailto:${to}`,
    `UID:${uid}`,
    `SUMMARY:${title}`,
    `DTSTART;TZID=W. Europe Standard Time:${day}T100000`,
    `DTEND;TZID=W. Europe Standard Time:${day}T110000`,
    "LOCATION:Baustelle Lindenweg",
    `SEQUENCE:${sequence}`,
    "DTSTAMP:20261029T100000Z",
    `STATUS:${method === "CANCEL" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  return deliverMail({
    from: PETRA,
    fromName: "Petra Keller",
    to,
    subject: method === "CANCEL" ? `Abgesagt: ${title}` : `Einladung: ${title}`,
    contentType: 'multipart/alternative; boundary="inv"',
    body: [
      "--inv",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Hallo, anbei die Einladung.",
      "--inv",
      `Content-Type: text/calendar; charset=utf-8; method=${method}`,
      "",
      ics,
      "--inv--",
    ].join("\r\n"),
  });
};
