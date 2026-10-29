/**
 * Test data for the fictional customer "Weber Haustechnik": a heating and plumbing business with a
 * few employees, a shared info@ mailbox and the usual mix of customers, suppliers and offices.
 * Dates are relative to the moment the seed runs, so the inbox always looks current.
 */
import { FLOOR_PLAN } from "./floor-plan";
import { simplePdf } from "./pdf";
import { winmailDat } from "./tnef";

/** `companyAdmin`: may use the Firmenverwaltung. */
export type SeedUser = { name: string; fullName: string; groups: string[]; companyAdmin?: boolean };

export const users: SeedUser[] = [
  { name: "jonas", fullName: "Jonas Weber", groups: ["info", "rechnung"], companyAdmin: true },
  { name: "anna", fullName: "Anna Weber", groups: ["info", "rechnung"] },
  { name: "sandra", fullName: "Sandra Klein", groups: ["info"] },
  { name: "max", fullName: "Max Becker", groups: [] },
];

export const groups = [
  { name: "info", description: "Allgemeine Anfragen" },
  { name: "rechnung", description: "Rechnungseingang" },
];

/** Folders per mailbox owner; "/" separates levels. The archive gets the JMAP role "archive". */
export const folders: Record<string, string[]> = {
  jonas: [
    "Archiv",
    "Kunden",
    "Kunden/Hoffmann",
    "Kunden/Keller Elektro",
    "Lieferanten",
    "Steuerberater",
  ],
  anna: ["Archiv", "Buchhaltung"],
  info: ["Archiv", "Erledigt"],
};

export type SeedMail = {
  id: string;
  owner: string;
  folder: string;
  from: [string, string];
  to: [string, string][];
  cc?: [string, string][];
  subject: string;
  body: string;
  hoursAgo: number;
  seen?: boolean;
  flagged?: boolean;
  /** Keywords of the default categories (server/categories/categories.ts). */
  categories?: string[];
  inReplyTo?: string;
  /** An HTML version next to `body`. */
  html?: string;
  attachment?: { name: string; type: string; content: string | Uint8Array };
};

const d = "weber-haustechnik.test";
const jonas: [string, string] = ["Jonas Weber", `jonas@${d}`];
const anna: [string, string] = ["Anna Weber", `anna@${d}`];
const info: [string, string] = ["Weber Haustechnik", `info@${d}`];
const petra: [string, string] = ["Petra Keller", "petra.keller@keller-elektro.test"];
const hoffmann: [string, string] = ["Markus Hoffmann", "m.hoffmann@schreinerei-hoffmann.test"];
const richter: [string, string] = ["Großhandel Richter", "bestellung@richter-sanitaer.test"];
const steuer: [string, string] = ["Kanzlei Braun", "kanzlei@braun-steuer.test"];
const stadtwerke: [string, string] = ["Stadtwerke Bühl", "service@stadtwerke-buehl.test"];
const sommer: [string, string] = ["Claudia Sommer", "c.sommer@example-privat.test"];
const lang: [string, string] = ["Thomas Lang", "thomas.lang@example-privat.test"];

export const mails: SeedMail[] = [
  {
    id: "angebot-wartung@keller-elektro.test",
    owner: "jonas",
    folder: "Posteingang",
    from: petra,
    to: [jonas],
    subject: "Angebot Wartungsvertrag 2027",
    body: "Hallo Jonas,\n\nanbei wie besprochen unser Angebot für den Wartungsvertrag 2027. Die Preise gelten bis Ende November.\n\nKönnt ihr mir bis Freitag Bescheid geben, ob wir die Heizungsanlagen in Halle 2 mit aufnehmen sollen?\n\nViele Grüße\nPetra Keller\nKeller Elektro GmbH",
    hoursAgo: 1,
    attachment: {
      name: "Angebot-Wartung-2027.pdf",
      type: "application/pdf",
      content: simplePdf({
        letterhead: "Keller Elektro GmbH",
        colour: [0.11, 0.33, 0.62],
        lines: [
          { text: "Angebot Nr. 2026-0412", size: 16, bold: true },
          { text: "Wartungsvertrag 2027 für Weber Haustechnik", gap: 4 },
          { text: "Leistung", bold: true, gap: 18 },
          { text: "Jährliche Prüfung der Elektroanlage, Halle 1 und Büro" },
          { text: "Prüfung nach DGUV V3, ortsveränderliche Geräte" },
          { text: "Option: Heizungsanlagen Halle 2" },
          { text: "Preis", bold: true, gap: 18 },
          { text: "1.840,00 € netto pro Jahr, Option Halle 2: 420,00 €" },
          { text: "Gültig bis 30.11.2026.", gap: 18 },
        ],
      }),
    },
  },
  {
    id: "termin-heizung@example-privat.test",
    owner: "jonas",
    folder: "Posteingang",
    from: sommer,
    to: [jonas],
    subject: "Heizung macht Geräusche – Termin möglich?",
    body: "Guten Tag Herr Weber,\n\nunsere Heizung klopft seit gestern ziemlich laut, vor allem morgens. Hätten Sie diese Woche noch einen Termin frei? Vormittags sind wir immer zu Hause.\n\nMit freundlichen Grüßen\nClaudia Sommer\nRheinstraße 12, Bühl",
    hoursAgo: 3,
  },
  {
    id: "lieferung-pumpe@richter-sanitaer.test",
    owner: "jonas",
    folder: "Posteingang",
    from: richter,
    to: [jonas],
    subject: "Ihre Bestellung 48211: Umwälzpumpe versandt",
    body: "Sehr geehrte Damen und Herren,\n\nIhre Bestellung 48211 (1× Umwälzpumpe Wilo Stratos 25/1-6) wurde heute versandt und wird voraussichtlich morgen zugestellt.\n\nIhr Team vom Großhandel Richter",
    hoursAgo: 6,
    seen: true,
  },
  {
    id: "rueckfrage-steuer@braun-steuer.test",
    owner: "jonas",
    folder: "Posteingang",
    from: steuer,
    to: [jonas],
    cc: [anna],
    subject: "Rückfrage Fahrzeugkosten Q3",
    body: "Hallo Herr Weber,\n\nfür die Umsatzsteuervoranmeldung Q3 fehlen uns noch die Tankbelege für den Transporter (September). Können Sie die bis Mittwoch nachreichen?\n\nBeste Grüße\nKanzlei Braun",
    hoursAgo: 26,
    flagged: true,
    categories: ["wartet-auf-antwort"],
  },
  {
    id: "re-angebot-hoffmann@weber-haustechnik.test",
    owner: "jonas",
    folder: "Kunden/Hoffmann",
    from: hoffmann,
    to: [jonas],
    subject: "Re: Badsanierung Obergeschoss",
    body: "Hallo Jonas,\n\ndanke für das Angebot. Wir würden gerne im Januar anfangen. Passt der 12.01. als Starttermin?\n\nGruß Markus",
    hoursAgo: 50,
    seen: true,
  },
  {
    // Old Outlook sends its attachments packed into a winmail.dat (TNEF); Kontext unpacks it.
    id: "lieferschein-48211@richter-sanitaer.test",
    owner: "jonas",
    folder: "Lieferanten",
    from: richter,
    to: [jonas],
    subject: "Lieferschein 48211",
    body: "Sehr geehrte Damen und Herren,\n\nanbei der Lieferschein und das Datenblatt zur Umwälzpumpe.\n\nIhr Team vom Großhandel Richter",
    hoursAgo: 26,
    seen: true,
    attachment: {
      name: "winmail.dat",
      type: "application/ms-tnef",
      content: winmailDat([
        {
          shortName: "LIEFER~1.PDF",
          longName: "Lieferschein-48211.pdf",
          type: "application/pdf",
          data: simplePdf({
            letterhead: "Großhandel Richter",
            colour: [0.13, 0.45, 0.33],
            lines: [
              { text: "Lieferschein 48211", size: 16, bold: true },
              { text: "Weber Haustechnik, Bühl", gap: 4 },
              { text: "1× Umwälzpumpe Wilo Stratos 25/1-6", gap: 18 },
            ],
          }),
        },
        {
          shortName: "DATENB~1.TXT",
          longName: "Datenblatt Stratos 25-1-6.txt",
          type: "text/plain",
          data: new TextEncoder().encode("Wilo Stratos 25/1-6\nFörderhöhe max. 6 m\n"),
        },
      ]),
    },
  },
  {
    id: "abschlag-oktober@stadtwerke-buehl.test",
    owner: "jonas",
    folder: "Posteingang",
    from: stadtwerke,
    to: [jonas],
    subject: "Ihre Abschlagsrechnung Oktober",
    body: "Sehr geehrter Kunde,\n\nIhre Abschlagsrechnung für Oktober steht im Kundenportal bereit. Der Betrag wird wie gewohnt per Lastschrift eingezogen.\n\nIhre Stadtwerke Bühl",
    hoursAgo: 75,
    seen: true,
  },
  {
    id: "teamessen@weber-haustechnik.test",
    owner: "jonas",
    folder: "Posteingang",
    from: anna,
    to: [jonas, ["Sandra Klein", `sandra@${d}`], ["Max Becker", `max@${d}`]],
    subject: "Weihnachtsessen – wer ist dabei?",
    body: "Hallo zusammen,\n\nich würde für den 18.12. einen Tisch im Ochsen reservieren. Gebt mir bitte bis Ende der Woche Bescheid, wer mitkommt.\n\nAnna",
    hoursAgo: 98,
    seen: true,
  },
  {
    id: "anfrage-neubau@example-privat.test",
    owner: "info",
    folder: "Posteingang",
    from: lang,
    to: [info],
    subject: "Anfrage Wärmepumpe Neubau",
    body: "Hallo,\n\nwir bauen gerade ein Einfamilienhaus in Bühl-Weitenung (ca. 160 m²) und suchen einen Betrieb für Wärmepumpe und Fußbodenheizung. Können Sie uns ein Angebot machen? Den Grundriss vom Erdgeschoss habe ich angehängt.\n\nViele Grüße\nThomas Lang",
    hoursAgo: 2,
    attachment: { name: "Grundriss-EG.svg", type: "image/svg+xml", content: FLOOR_PLAN },
    categories: ["in-bearbeitung"],
  },
  {
    id: "reklamation@example-privat.test",
    owner: "info",
    folder: "Posteingang",
    from: sommer,
    to: [info],
    subject: "Wasserhahn tropft wieder",
    body: "Guten Tag,\n\nder Wasserhahn in der Küche, den Sie im August getauscht haben, tropft wieder. Können Sie bitte noch einmal vorbeikommen?\n\nClaudia Sommer",
    hoursAgo: 20,
    categories: ["wartet-auf-antwort"],
  },
  {
    id: "rechnung-117@keller-elektro.test",
    owner: "rechnung",
    folder: "Posteingang",
    from: petra,
    to: [["Rechnung Weber", `rechnung@${d}`]],
    subject: "Rechnung 2026-117",
    body: "Sehr geehrte Damen und Herren,\n\nanbei unsere Rechnung 2026-117 für die Elektroarbeiten in der Werkstatt. Zahlbar innerhalb von 14 Tagen.\n\nKeller Elektro GmbH",
    hoursAgo: 30,
    attachment: {
      name: "Rechnung-2026-117.pdf",
      type: "application/pdf",
      content: simplePdf({
        letterhead: "Keller Elektro GmbH",
        colour: [0.11, 0.33, 0.62],
        lines: [
          { text: "Rechnung 2026-117", size: 16, bold: true },
          { text: "Elektroarbeiten Werkstatt", gap: 4 },
          { text: "Positionen", bold: true, gap: 18 },
          { text: "Unterverteilung erneuert          1.150,00 €" },
          { text: "Leitungen und Steckdosen            640,00 €" },
          { text: "Summe netto                       1.790,00 €", bold: true, gap: 6 },
          { text: "Zahlbar innerhalb von 14 Tagen.", gap: 18 },
        ],
      }),
    },
  },
  {
    id: "urlaub-anna@weber-haustechnik.test",
    owner: "anna",
    folder: "Posteingang",
    from: jonas,
    to: [anna],
    subject: "Urlaubsplanung Januar",
    body: "Hi Anna,\n\nkannst du bis nächste Woche die Urlaubsplanung für Januar fertig machen? Max hat schon gefragt.\n\nJonas",
    hoursAgo: 5,
  },
  {
    id: "newsletter-november@richter-sanitaer.test",
    owner: "jonas",
    folder: "Posteingang",
    from: richter,
    to: [jonas],
    subject: "Newsletter: Herbstaktion Wärmepumpen",
    body: "Herbstaktion: 10 % auf Wärmepumpen-Zubehör bis Ende November.",
    html: `<!doctype html><html><body style="margin:0;background:#f4f4f5">
<table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#fff;font-family:Arial">
<tr><td><img src="https://images.richter-sanitaer.test/herbst.jpg" width="600" alt="Herbstaktion"></td></tr>
<tr><td style="padding:24px"><h1 style="color:#0f766e">Herbstaktion Wärmepumpen</h1>
<p>10 % auf Zubehör bis Ende November. <a href="https://richter-sanitaer.test/aktion">Zur Aktion</a></p>
<img src="https://track.richter-sanitaer.test/open.gif?u=jonas" width="1" height="1" alt=""></td></tr>
</table></body></html>`,
    hoursAgo: 40,
    seen: true,
  },
  {
    /** Test mail with the usual XSS tricks; nothing in it may run (see e2e "XSS"). */
    id: "xss-test@phish.test",
    owner: "jonas",
    folder: "Posteingang",
    from: ["Buchhaltung", "rechnung@phish.test"],
    to: [jonas],
    subject: "Offene Rechnung – bitte prüfen (XSS-Test)",
    body: "Bitte öffnen Sie die Rechnung im Anhang.",
    html: `<html><head><script>top.__xss = "head"; alert("xss")</script>
<meta http-equiv="refresh" content="0;url=javascript:top.__xss='meta'">
<base href="javascript:top.__xss='base'//"></head>
<body onload="top.__xss='onload'">
<p>Sehr geehrte Damen und Herren,</p>
<img src="x" onerror="top.__xss='onerror'">
<svg onload="top.__xss='svg'"><circle r="5"></circle></svg>
<a id="js-link" href="javascript:top.__xss='link'">Rechnung öffnen</a>
<iframe src="javascript:top.__xss='iframe'"></iframe>
<form action="https://phish.test/login"><input name="password"><button>Anmelden</button></form>
<div style="background:url(javascript:top.__xss='css')">Betrag: 1.234,56 €</div>
<object data="javascript:top.__xss='object'"></object>
<p>Mit freundlichen Grüßen</p>
</body></html>`,
    hoursAgo: 52,
  },
  {
    /**
     * Written in Outlook, as it arrives forwarded through Gmail: every line a `MsoNormal`
     * paragraph without the `<style>` that took their margin, blank paragraphs between, and the
     * signature in fixed colours (black on white, Outlook's dark blue). See e2e "Outlook".
     */
    id: "outlook-zaehler@stadtwerke-buehl.test",
    owner: "jonas",
    folder: "Posteingang",
    from: stadtwerke,
    to: [jonas],
    subject: "Zählerwechsel Gewerbehalle Industriestraße",
    body: "Sehr geehrter Herr Weber,\n\nam Dienstag tauschen wir den Stromzähler in Ihrer Gewerbehalle.\n\nViele Grüße\nSabine Roth",
    html: `<div lang="DE" style="word-wrap:break-word"><div class="WordSection1">
<p class="MsoNormal"><span>Sehr geehrter Herr Weber,<o:p></o:p></span></p>
<p class="MsoNormal"><span><o:p>&nbsp;</o:p></span></p>
<p class="MsoNormal"><span>am Dienstag, 3.11., tauschen wir zwischen 8 und 12 Uhr den Stromzähler in Ihrer Gewerbehalle in der Industriestraße 14. Für etwa eine Stunde ist dabei der Strom in der Halle abgeschaltet.<o:p></o:p></span></p>
<p class="MsoNormal"><span><o:p>&nbsp;</o:p></span></p>
<p class="MsoNormal"><span>Dafür bräuchten wir bitte bis Freitag:<o:p></o:p></span></p>
<p class="MsoNormal"><span>1. Eine kurze Bestätigung, dass unser Monteur den Zählerraum ab 8 Uhr betreten kann.<o:p></o:p></span></p>
<p class="MsoNormal"><span>2. Den Namen einer Ansprechperson vor Ort, falls der Schlüssel nicht im Büro liegt.<o:p></o:p></span></p>
<p class="MsoNormal"><span><o:p>&nbsp;</o:p></span></p>
<p class="MsoNormal"><span>Der neue Zähler wird aus der Ferne ausgelesen; Sie müssen den Stand also nicht mehr selbst melden.<o:p></o:p></span></p>
<p class="MsoNormal"><span><o:p>&nbsp;</o:p></span></p>
<p class="MsoNormal"><span>Viele Grüße<o:p></o:p></span></p>
<p class="MsoNormal"><span>Sabine Roth<o:p></o:p></span></p>
<p class="MsoNormal"><o:p>&nbsp;</o:p></p>
<p class="MsoNormal" style="margin-bottom:12.0pt"><span style="font-size:10pt;font-family:&quot;Franklin Gothic Book&quot;,sans-serif;color:black;background:white">Netzservice Gewerbekunden</span></p>
<p class="MsoNormal"><span style="font-size:10pt;color:#1F497D">Stadtwerke Bühl GmbH · Telefon 07223 9400-0</span></p>
<p class="MsoNormal"><span style="font-size:10pt;color:windowtext">Sitz Bühl, Amtsgericht Mannheim HRB 700123</span></p>
</div></div>`,
    hoursAgo: 60,
    seen: true,
  },
];

/** Contact groups (JSContact cards of kind "group"); members by uid. */
export type SeedContactGroup = { uid: string; owner: string; name: string; members: string[] };

export const contactGroups: SeedContactGroup[] = [
  { uid: "lieferanten", owner: "jonas", name: "Lieferanten", members: ["petra-keller", "richter"] },
  {
    uid: "team",
    owner: "jonas",
    name: "Team",
    members: ["anna-weber", "sandra-klein", "max-becker"],
  },
];

export type SeedContact = {
  uid: string;
  owner: string;
  given: string;
  surname: string;
  company?: string;
  email?: string;
  phone?: string;
  street?: string;
  city?: string;
  note?: string;
};

export const contacts: SeedContact[] = [
  {
    uid: "petra-keller",
    owner: "jonas",
    given: "Petra",
    surname: "Keller",
    company: "Keller Elektro GmbH",
    email: petra[1],
    phone: "+49 7223 81234",
    street: "Industriestraße 4",
    city: "77815 Bühl",
    note: "Ansprechpartnerin Wartungsvertrag",
  },
  {
    uid: "markus-hoffmann",
    owner: "jonas",
    given: "Markus",
    surname: "Hoffmann",
    company: "Schreinerei Hoffmann",
    email: hoffmann[1],
    phone: "+49 7223 55678",
    street: "Hauptstraße 41",
    city: "77815 Bühl",
    note: "Badsanierung OG ab Januar",
  },
  {
    uid: "claudia-sommer",
    owner: "jonas",
    given: "Claudia",
    surname: "Sommer",
    email: sommer[1],
    phone: "+49 160 1234567",
    street: "Rheinstraße 12",
    city: "77815 Bühl",
    note: "Privatkundin, Gastherme Baujahr 2009",
  },
  {
    uid: "thomas-lang",
    owner: "jonas",
    given: "Thomas",
    surname: "Lang",
    email: lang[1],
    phone: "+49 171 7654321",
    city: "77815 Bühl-Weitenung",
    note: "Neubau, Wärmepumpe angefragt",
  },
  {
    uid: "kanzlei-braun",
    owner: "jonas",
    given: "Sabine",
    surname: "Braun",
    company: "Kanzlei Braun",
    email: steuer[1],
    phone: "+49 7221 99887",
    street: "Lichtentaler Straße 2",
    city: "76530 Baden-Baden",
  },
  {
    uid: "richter",
    owner: "jonas",
    given: "Bestellannahme",
    surname: "Richter",
    company: "Großhandel Richter",
    email: richter[1],
    phone: "+49 721 445566",
    city: "76131 Karlsruhe",
  },
  {
    uid: "anna-weber",
    owner: "jonas",
    given: "Anna",
    surname: "Weber",
    company: "Weber Haustechnik",
    email: `anna@${d}`,
    phone: "+49 7223 1000-11",
  },
  {
    uid: "sandra-klein",
    owner: "jonas",
    given: "Sandra",
    surname: "Klein",
    company: "Weber Haustechnik",
    email: `sandra@${d}`,
    phone: "+49 7223 1000-12",
  },
  {
    uid: "max-becker",
    owner: "jonas",
    given: "Max",
    surname: "Becker",
    company: "Weber Haustechnik",
    email: `max@${d}`,
    phone: "+49 7223 1000-13",
  },
];

export type SeedEvent = {
  uid: string;
  owner: string;
  title: string;
  /** Days from today (0 = today, negative = past), local time "HH:MM". */
  day: number;
  time: string;
  minutes: number;
  location?: string;
  attendees?: string[];
  description?: string;
  /** Repeats, as a JSCalendar recurrenceRule. */
  recurrence?: { frequency: "daily" | "weekly" | "monthly"; interval?: number; count?: number };
};

export const events: SeedEvent[] = [
  {
    uid: "baubesprechung-hoffmann",
    owner: "jonas",
    title: "Baubesprechung Hoffmann",
    day: 0,
    time: "10:00",
    minutes: 60,
    location: "Hauptstraße 41, Bühl",
    attendees: [`anna@${d}`, hoffmann[1]],
  },
  {
    uid: "heizung-sommer",
    owner: "jonas",
    title: "Heizung prüfen – Sommer",
    day: 1,
    time: "08:30",
    minutes: 90,
    location: "Rheinstraße 12, Bühl",
  },
  {
    uid: "team-montag",
    owner: "jonas",
    title: "Teambesprechung",
    day: 3,
    time: "07:30",
    minutes: 30,
    recurrence: { frequency: "weekly", count: 12 },
    location: "Werkstatt",
    attendees: [`anna@${d}`, `sandra@${d}`, `max@${d}`],
  },
  {
    uid: "steuer-braun",
    owner: "jonas",
    title: "Termin Kanzlei Braun",
    day: 2,
    time: "14:00",
    minutes: 60,
    location: "Baden-Baden",
  },
  {
    uid: "lieferung-richter",
    owner: "jonas",
    title: "Lieferung Großhandel Richter",
    day: 1,
    time: "13:00",
    minutes: 30,
  },
  {
    uid: "angebot-lang",
    owner: "jonas",
    title: "Besichtigung Neubau Lang",
    day: 4,
    time: "16:00",
    minutes: 60,
    location: "Bühl-Weitenung",
  },
  {
    uid: "wartung-keller",
    owner: "jonas",
    title: "Wartung Halle 2 – Keller Elektro",
    day: -1,
    time: "09:00",
    minutes: 120,
    location: "Industriestraße 4, Bühl",
  },
];
