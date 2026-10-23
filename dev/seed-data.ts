/**
 * Test data for the fictional customer "Weber Haustechnik": a heating and plumbing business with a
 * few employees, a shared info@ mailbox and the usual mix of customers, suppliers and offices.
 * Dates are relative to the moment the seed runs, so the inbox always looks current.
 */

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
  inReplyTo?: string;
  /** An HTML version next to `body`. */
  html?: string;
  attachment?: { name: string; type: string; content: string };
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
      content: "%PDF-1.4\n% Testangebot\n",
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
    body: "Hallo,\n\nwir bauen gerade ein Einfamilienhaus in Bühl-Weitenung (ca. 160 m²) und suchen einen Betrieb für Wärmepumpe und Fußbodenheizung. Können Sie uns ein Angebot machen?\n\nViele Grüße\nThomas Lang",
    hoursAgo: 2,
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
      content: "%PDF-1.4\n% Testrechnung\n",
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
