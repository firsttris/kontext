# Changelog

What changed in each release of Kontext, newest first. The images are `tristanteu/kontext` and
`tristanteu/kontext-box` with the same version; how to update is in the
[installation guide](https://firsttris.github.io/kontext/installation.html#6-updates) (German).
Steps that an update needs beyond raising the version are marked **Upgrade**.

## Unreleased

- Calendar: a hidden calendar stays hidden on every device, also a colleague's calendar shared to
  read: the choice is the calendar's per-person `isVisible` on the server (Stalwart 1.0), no
  longer per browser. What a device hid before is moved to the server once. Birthdays and due
  tasks stay per device.
- Mail: search finds words that stand only in a PDF, Word, Excel, PowerPoint or OpenDocument
  attachment (Stalwart 1.0 indexes them), and such hits say "im Anhang" (SearchSnippet/get with
  every search page, `src/lib/attachment-hit.ts`). The company admin shows "Die Suche wird noch
  aufgebaut" while Stalwart builds its index, e.g. after the move to 1.0
  (`/api/company/search-index`, `x:IndexQueueStatus`). **Upgrade:** give the role
  `Kontext-Server` the right `sysIndexQueueStatusGet` (installation guide, Firmenverwaltung);
  without it the notice stays away.
- Mail: assign mails in a shared mailbox. "Zuweisen" gives a mail to a person ("Mir zuweisen", a
  colleague, nobody) and marks it done; everyone in the mailbox sees it on the mail and in the
  list, and the filters "Mir zugewiesen" and "Offen" show what still waits. Stored on the mail
  as shared JMAP Object Metadata in Kontext's namespace `kontext.firsttris.github.io`, filtered
  by Stalwart (`src/lib/assignment.ts`); needs Stalwart 1.0.
- Stalwart 1.0.1 instead of 0.16.27: sign-in as a registered OAuth client, stricter JMAP (header
  forms, calendar queries), contact photos as blobs, renamed management fields.
  **Upgrade:** Stalwart 1.0 does not open a 0.16 data store: migrate it with `stalwart-migrate`
  before pulling this version, then register Kontext as the first-party OAuth client `kontext`
  and allow directory queries (installation guide, "Stalwart 0.16 auf 1.0 heben", steps 12 and
  13). Everyone signs in once more.
- S/MIME: the company admin keeps the trusted authorities ("S/MIME-Stellen"): upload a root or
  intermediate certificate (PEM or DER), see its name, issuer, validity and fingerprint, remove
  it. Only current CA certificates, at most 100; they count beside Mozilla's list and
  `SMIME_ROOTS`, and earlier trust answers are dropped on a change
  (`/api/company/smime-authorities`, `server/smime/authorities.ts`). **Upgrade:** migration
  `0041_smime_authorities` adds the table `smime_authorities`; the server applies it at start.
- S/MIME: revocation by CRL where a certificate names no OCSP responder or it gives no usable
  answer: the http(s) CRL Distribution Points (RFC 5280 §4.2.1.13), at most 10 MB and 15 s, public
  hosts only; a list counts only when signed by the issuer under its name, current, and neither
  delta nor indirect nor with an unknown critical extension. Lists are cached until their
  nextUpdate (at most a day, 100 lists; a failed one is retried after ten minutes).
- S/MIME: signatures with EC keys (ECDSA on P-256, P-384, P-521) are checked in the browser with
  WebCrypto instead of showing "nicht prüfbar"; certificates with EC keys can be imported and
  remembered. Checked against signatures made with OpenSSL.
- S/MIME: looking up certificates in an authority's LDAP directory is left out on purpose (own
  TCP connections, a new dependency, a directory per authority); see docs/encryption.md.
- Chat: react with any emoji – "+" beside the seven quick reactions (in the long-press sheet on
  phones) opens a picker with about 430 emojis in nine categories and a search by English or
  German words (`src/lib/emoji.ts`, no library). The server now takes exactly one emoji per
  reaction: one grapheme cluster of emoji code points, flags and keycaps included
  (`isOneEmoji`); before, several in a row passed and flags did not.
- Chat: "Auch im Kanal zeigen" under the thread's reply field (like Slack's "Also send to
  channel"): the reply also stands in the channel, under "Antwort im Thread zu: …", which opens
  the thread; it counts as unread there and moves the channel up. Works in confidential channels.
  **Upgrade:** migration `0040_chat_also_in_channel` adds `chat_messages.also_in_channel`; the
  server applies it at start.
- Development: `bun run dev` fills tasks and chat of the demo too (`dev/demo-data.ts`, once per
  server database, recognised by #baustelle-hoffmann): the people sign in through
  `POST /api/auth/sign-in/stalwart` like the login form and use Kontext's API. The pictures and the
  film use the same code (`e2e/demo-data.ts` is a thin wrapper); the e2e seed is unchanged. Fixed
  on the way: Max's task on the info@ board was never made (he is no member there), now Anna's.
- README: a picture of the rules (`docs/screenshots/rules.png`, from `e2e/screenshots.spec.ts`).
- Mail: printing includes the pictures from the internet when the reading pane shows them – the
  sender is trusted (and confirmed), or "Laden" was clicked for that mail. The choice is kept per
  mail for the session (`src/features/mail/remote-images.ts`). The printed page keeps its sandbox
  and gets a CSP of its own (`printPolicy`) that lets in images from outside and nothing else (no
  remote styles, fonts or media); a slow picture holds the print dialog back for at most 8 s.
- Tasks over CalDAV: app passwords for people with two-step sign-in, whose Thunderbird or phone
  cannot enter a code. Under *Einstellungen → Aufgaben in anderen Apps → App-Passwörter* one makes
  a password per app (name, e.g. "Thunderbird Büro"; asks for the password and code again), sees
  it once, and finds it listed with when it was last used, revocable on its own. Like an agent's
  access key it has its own sign-in session and Stalwart grant; only its SHA-256 is kept, and it
  works for `/dav` only, never for signing in to Kontext (`/api/app-passwords`,
  `server/dav/app-passwords.ts`). A revoked one stops at once. **Upgrade:** the database gets the
  table `app_password` (migration `0039_app_passwords`) at start; nothing else to do.
- Tasks over CalDAV: `sync-collection` (RFC 6578), so clients fetch only what changed. The sync
  token is the board's ctag; the server remembers, in memory, the tasks and ETags behind its last
  50 tokens per board and answers with what is new, changed or gone (404). An unknown token (after
  a restart) gets `DAV:valid-sync-token`, and the client syncs once from the start.
- Encryption: attachments of a mail to be encrypted no longer reach Stalwart unencrypted. While
  "Vertraulich senden" is on, files, pictures in the text, files "Aus Dokumente" (fetched by the
  browser through the new `POST /api/documents/download`) and the files of a forwarded encrypted
  mail stay in the browser until they are encrypted with the mail; this covers PGP, S/MIME and the
  link. Switching encryption on after adding files pulls them into the browser and deletes the
  draft that held them unencrypted; switching it off uploads them as before. Files and pictures
  of an encrypted mail may be 25 MB together.
- e2e: the tests that opened the seed's mails from Jonas' inbox list use copies of them made for
  the test (`e2e/own-mails.ts`) and remove them afterwards, so a full inbox no longer pushes them
  out of the rendered rows.

- Tasks: the contact page lists the tasks about any mail the person sent or got – older ones and
  mails in shared mailboxes too – by looking up the mails tasks link to (`Email/get` of `from`,
  `to`, `cc`, at most 500 per account) instead of only the last five own mails; mails are matched
  by account and id. New "Aufgabe zum Termin" in the appointment (desktop and phone) creates a task
  linked to it (`kind: "event"`, the day in `threadId`), which opens the appointment again.
- Mail: read receipts are matched by the report's `Original-Message-ID` too (RFC 8098), so
  receipts from programs that set no `In-Reply-To` count; the sent mail looks for them by sender
  (its recipients) or subject, paging like the delivery reports (`src/jmap/search-pages.ts`).
  Incoming receipts for one's own sent mails are filed quietly: marked read and moved to the
  archive – only when they name a mail in Sent that asked for a receipt; anything else stays.
- Company admin: "Regeln" at an employee's entry – the admin sees and edits the person's mail
  rules (`GET`/`PUT /api/company/employees/:id/rules`, `POST …/rules/apply`, admin only). They are
  the person's own Sieve script, so the employee sees and changes them in Settings like their own;
  the out-of-office reply stays as it is.
- Tasks: "Erinnern" right in the "Neue Aufgabe" dialog (the same choices as in the open task,
  from the due day or a time by hand); a new due day moves a chosen reminder along. Sent with the
  task as `remindAt` on create.
- Mail: "Wiedervorlage" for several picked mails at once, from the selection bar – also across
  the own and shared mailboxes in "Alle Posteingänge", each mail into its own account's snoozed
  folder, with one "Rückgängig" for all. Offered only when every picked mail may leave its folder.
  "Alle Posteingänge" now shows what came back ("Wieder vorgelegt") from every inbox on top.
- A short tour on the first start: five or six cards through Mail, "Neue Mail", a shared mailbox
  like info@ (for whoever has one), Calendar and Chat, each lighting up the real place – the rail
  on a desktop, the tab bar on a phone ("Mehr" where Chat is not in it), a centred card where the
  place is not shown. "Weiter", "Zurück", "Überspringen"; the focus stays in the card and Escape
  skips. Shown once per person and device (`kontext.tour.seen` in the browser: the server has no
  per-person settings store, and the phone's tour points elsewhere); "Einführung" in the user
  menu, or under "Mehr" on a phone, starts it again. Built on the Radix dialog already in the
  project, no new dependency.
- Fixed: on phones the composer's action row ran off the screen, so "Als Entwurf speichern" and
  "Verwerfen" could not be reached. Below `md` the receipt, delivery-report, confidential and
  sign switches and "Als Entwurf speichern" now sit under "Weitere Aktionen"; desktop is unchanged.
- Company admin: "Abmelden nach Inaktivität" for computers several people share – off by default,
  or 15 / 30 minutes, 1 / 4 / 8 hours (a `company_setting`, `GET`/`PUT /api/company/idle-logout`).
  Before the time runs out Kontext asks "Angemeldet bleiben?" with a one-minute countdown; without
  an answer it saves open mails as drafts and signs out the usual way. Pointer, key and wheel
  input, the tab coming into view and a running call count; the last input is shared by every
  tab through localStorage, so a browser closed past the time signs out when opened again.
  Enforced in the browser only (see docs/architecture.md for why not on the server).
- Mail: "Zustellbestätigung anfordern" when writing – the receiving servers send back a delivery
  report (DSN, RFC 3461) as proof the mail was accepted, or why not. The submission's envelope
  carries `NOTIFY=SUCCESS,FAILURE` for each recipient and `RET=HDRS` and `ENVID` on `mailFrom`
  (RFC 8621 §7); the envelope id is the local part of the mail's Message-ID. The sent mail shows
  "Zugestellt an … · time" (or "Nicht zugestellt", "Verzögert") once the report is in; the report
  itself shows who it is about, delivered or not, when, and the server's reason. Stalwart accepts
  the parameters and reports local deliveries too; it leaves `EmailSubmission.dsnBlobIds` empty,
  so Kontext finds the reports among the mails. Not for encrypted or signed mails.
- Mail: import .eml files into a folder – with the button beside the "Alle / Ungelesen" filter
  (several files at once), or by dropping them onto the list or onto a folder in the sidebar. Each
  file is uploaded as a blob and imported with JMAP `Email/import` into that folder, marked read,
  with `receivedAt` taken from its Date header (Stalwart otherwise takes the newest Received
  header). A notice says how many went in and names each file that did not, with the reason.
  Outlook's .msg and whole .mbox mailboxes are not supported and say so; whole mailboxes move with
  the Umzug.
- Calendar: "Geburtstage" – the contacts' birthdays (JSContact `anniversaries` of kind "birth")
  from every address book you can see, as all-day entries in day, week, month and list, with the
  age when the year is known ("Petra Keller (52)"). A click opens the contact. Worked out in the
  browser, so it is always current and read-only; 29 February falls on the 28th in other years.
  Switched off like a calendar under "Meine Kalender".
- Mail: sort the mail list from its header (the arrows, on the phone too) – newest or oldest
  first, unread, flagged or with a category first (in the account's order of categories), by
  sender or subject, or the largest first; the newest first within each group. One choice for
  every folder, "Alle Posteingänge" and the search, kept on the device. The server sorts
  (`Email/query`, RFC 8621 §4.4.2), so loading more keeps the order; in the conversation view the
  whole conversation counts (`someInThreadHaveKeyword`, `allInThreadHaveKeyword`).
- Mail: "Antwort an" (Reply-To) when writing – revealed next to "Cc / Bcc", with the same address
  suggestions; replies then go to those addresses instead of the sender. It goes out with every
  kind of sending (JMAP `replyTo`, and the `Reply-To` header of mails Kontext builds itself for
  PGP and S/MIME, outside and in the protected headers) and stays in the draft. A default per
  sending address (JMAP `Identity.replyTo`) is set under *Einstellungen → Signatur*; it fills the
  field and follows a change of sender unless the field was edited. Answering a mail that carries
  Reply-To already went to that address; now covered by tests.
- Mail: "Als Anhang weiterleiten" – in a mail's "Weitere Aktionen" menu, and for several picked
  mails in the selection bar: the original goes whole as `<subject>.eml` (message/rfc822) in a
  new mail, by the blob Stalwart already holds (JMAP `blobId`), so nothing is downloaded or
  uploaded. An encrypted mail goes as it came, still encrypted.
- Settings: "Vertretung" – give a colleague your mailbox (every folder), calendars and contacts at
  once, to view or to edit, see who has access to what (also from the share dialogs) and take it
  all back with "Alles entziehen"; only seeing your free and busy times stays when every
  colleague sees them. Folders, sending in your name and further sharing stay with you. A mailbox
  shared this way (or handed over) is now labelled "Postfach von …".
- Calendar: print the week or the month on landscape A4, e.g. for the pin board in the workshop –
  the printer in the calendar's header, `p` or Ctrl+P. The week as seven columns with every
  appointment's time, title and place, all-day ones first; the month as its grid with start and
  title, "+2 weitere" for what does not fit; the list prints its next seven days. Only the
  calendars shown, with their colours as a legend. Like a printed mail, the sheet is a page of its
  own in a hidden frame without scripts that loads nothing.
- Calendar: "Duplizieren" on an appointment opens the editor with a copy – same title, place,
  video meeting, attendees, notes, reminder, show-as, calendar, documents and length, on the
  original's date until changed. Saved as a new appointment (new uid), so the attendees get
  invitations as for any new one. A date of a series is copied as that date alone, without the
  repetition.
- Contacts: several at once – pick contacts by their box (Shift for a range, Ctrl/⌘ for one more;
  on phones "Auswählen" or a long press), then add them to a group, export them as one vCard file
  or delete them after one question with the count. Groups are offered within the account the
  contacts are in, as members are named by uid there.
- Mail: the "External" hint, switched on per company under *Einstellungen → Externe
  Empfänger* (off until then). Mail from outside the company carries the mark "Extern" in the
  list and when reading; before a mail goes to recipients outside, or an appointment invites new
  attendees outside, Kontext asks once ("An externe Empfänger senden?", naming them), after
  "Anhang vergessen?" when both come. Inside are the company's own domains (Stalwart's
  `x:Domain`) and the partner domains entered there, each with its subdomains. The database gets
  the table `partner_domain` (migration `0038_partner_domains`) at start.
- Company: "Pflichtangaben" – a legal footer (register court and number, managing directors,
  registered office, VAT ID …) set once under *Einstellungen → Firma → Pflichtangaben* and put
  under every mail sent, as text and HTML, encrypted and signed mails and the mail with a
  "Vertraulich senden" link included. While writing it shows below the text, not editable; drafts
  never carry it. Kept as a `company_setting` row, so no migration; empty (the default) adds
  nothing.
- Mail: pictures in the text – by the "Bild einfügen" button, pasted (a screenshot) or dropped
  in, and resized by their corners. They go out as inline images (`cid:` in multipart/related),
  so Outlook, Gmail and Apple Mail show them in the text; drafts keep them. Files of a reopened
  draft now stay with it when it is saved more than once.
- Mail: snippets know more placeholders – `{Datum}` (today's date), `{Absender}` (one's own name)
  and own fields: any other `{Wort}`, such as `{Auftragsnummer}`, is asked for in one small
  dialog when the snippet is inserted and filled in; a field left empty stays visible.
  `{Vorname}` and `{Name}` work as before.
- Calendar: "Aus Datei übernehmen" under *Kalender verwalten* – appointments from an .ics file
  (an export from Google, Outlook or Apple) into a calendar the user may write to, with a preview
  of what is new and what is already there (same UID in the account), which is skipped. Stalwart
  reads the file (`CalendarEvent/parse`); series keep their changed dates; attendees get no
  message. The move now also leaves out the iTIP `method` (Google's `METHOD:PUBLISH`), which
  Stalwart refuses on create.
- Calendar: a default reminder per calendar – in *Kalender verwalten* the bell next to a calendar
  sets the reminder new appointments in it get, one for appointments with a time and one for
  all-day ones. Kept per person in Stalwart (`defaultAlertsWithTime`,
  `defaultAlertsWithoutTime`); without one it stays 15 minutes before.
- Mail: a winmail.dat from older Outlook versions (TNEF) shows as the files inside it, with
  preview, download and "In Dokumente"; the browser unpacks it and puts the files up as blobs of
  the mailbox.
- Mail: more formatting when writing – font size, text and background color, and tables (rows
  and columns added or removed from the menu, a header row on or off). Sent as inline styles, so
  Outlook and Gmail show it as written; the plain-text part has a table row per line. The
  signature editors have the same bar.
- Calendar: "Kalender abonnieren" under *Kalender verwalten* – a calendar by its address (iCal,
  webcal) such as school holidays or the waste collection, as a calendar of its own that the
  server keeps up to date every six hours (or on "Jetzt aktualisieren"). Only https on the
  internet; it does not count for availability. The database gets the table
  `calendar_subscription` at start.
- Mail on the phone: swipe a mail in the list to the left to archive it, to the right to mark it
  read or unread. What each direction does (archive, delete, read/unread, flag or nothing) is set
  per device under *Einstellungen → Darstellung → Wischen in der Mail-Liste*.
- Calendar: "Dieser und alle folgenden" beside "Nur dieser Termin" and "Alle Termine der Serie",
  for changing and for deleting. The series so far ends before the date; when changing, a new
  series with the changes starts there (a series of so many dates keeps its number in all).
  Attendees hear of both, as with Outlook.
- Company signature: besides `[Name]` and `[E-Mail]` the placeholders `[Telefon]`, `[Mobil]`,
  `[Position]` and `[Abteilung]`. Each person enters them once under *Einstellungen → Profil*
  ("Angaben für die Signatur"); saving updates their signature at once. A line whose placeholder
  has no value is left out. The database gets the table `signature_detail` at start.
- Mail: "Papierkorb leeren" and "Spam leeren" at the top of those folders, after a question with
  the number of mails. A mail that is also in another folder only leaves Spam or Papierkorb; in a
  shared mailbox only for those who may delete there.
- Mail: "Anhang vergessen?" – when the own text or the subject speaks of an attachment ("Anhang",
  "anbei", "angehängt", "attached" …) and nothing is attached, Kontext asks before sending: attach
  a file or send without. The quoted mail below a reply does not count.
- Mail: an invitation in a mail (Outlook, Google, Apple, a colleague) shows a line above the text
  with what, when and where, whether it is in the calendar and the answer so far, and Zusagen /
  Vielleicht / Absagen and "In den Kalender". Kontext puts the event into the calendar and sends
  the answer to the organizer itself (iTIP REPLY); a called-off event has "Aus dem Kalender
  entfernen". The bare iCalendar part no longer shows as an attachment.
- Calendar: a reminder per appointment, from "Zu Beginn" to "1 Woche vorher" (all-day: on the day
  or days before, in the morning), as a notification or by mail. Stalwart sends the mail and tells
  the server when a notification is due, so both come with Kontext closed too (the notification as
  a push, where notifications are on). New appointments start with a notification 15 minutes
  ahead as before; appointments without a reminder no longer remind (before, every appointment
  reminded 15 minutes ahead while Kontext was open).
- Calendar: "Feiertage eintragen" under *Kalender verwalten* puts the public holidays of a German
  state (all 16) into a calendar of their own, this year and next, all-day and shown as free;
  running it again adds only what is missing. The phone's opening hours take the state too
  (before, always Baden-Württemberg).
- Keyboard: "Zum Inhalt springen" as the first Tab stop (seen only with the focus) leads past the
  rail and the sidebar; a dialog gives the focus back to what opened it, also one opened from the
  URL like "Neuer Termin"; "Neue Aufgabe" starts in its title; the small month in the calendar is
  one Tab stop with the arrow keys (Page Up and Page Down for months); Strg+Enter sends a mail.
- Accessibility: WCAG 2.2 AA as the goal, checked by axe-core on every page, light and dark, desktop
  and phone (`e2e/accessibility.spec.ts`). Grey text and white text on blue have enough contrast
  now, days outside the month in the small calendar too; tasks in the calendar are touch targets of
  24 px on phones; view and filter switches are marked as
  the current page instead of as pressed buttons; "Reduce motion" turns animations off. New page
  [Barrierefreiheit](https://firsttris.github.io/kontext/accessibility.html).
- Documents: Schreibzeug trusts Caddy as its proxy (`SCHREIBZEUG_TRUSTED_PROXIES` in
  `deploy/compose.yaml` and `schreibzeug.container`), so its sign-in limit counts per person, not
  for everyone at once. **Upgrade:** with Compose, `git pull` and start again; with Quadlet, copy
  the new `schreibzeug.container` (with your domain) and `systemctl daemon-reload`.
- Documents: `deploy/.env.example` and the Quadlet use Schreibzeug 0.1.8 (was 0.1.4). **Upgrade:**
  raise `SCHREIBZEUG_VERSION` in `deploy/.env` (or the image in `schreibzeug.container`) and start
  again; Schreibzeug's [changelog](https://github.com/firsttris/schreibzeug/blob/main/CHANGELOG.md)
  names its own steps.
- A card above the mail list offers to install Kontext as an app (on phones) and to turn on
  notifications, one at a time.
- Calendar: a task due at a time sits at that time in the week and day view.
- "Neu laden" after an update also works in a tab the service worker does not control.
- Backups: the systemd unit gives Restic a cache directory, so it no longer reads the repository's
  metadata from S3 on every run. **Upgrade:** after `git pull`, run `./backup-control.sh install`
  in `deploy/` again (it copies the changed units).

## 0.1.6 – 2026-10-27

- Settings show which version runs: the app's on this device and, when it differs, the server's.
- Company admin: **Datensicherung** shows the last backup, the space used, sets the time and
  starts a backup on demand. **Upgrade:** install the systemd units once
  (`./backup-control.sh install`, then `systemctl enable --now kontext-backup.timer
  kontext-backup-control.path`) and remove the old cron entry; without them the page says
  "Steuerung auf dem Server nicht eingerichtet" and cron keeps working.
- Faster on phones: OpenPGP loads only when needed, texts per page, Brotli, a smaller precache.
- Chat: a conversation opens at the newest message, also in Safari on iOS.
- Invitations write the time zone out over the whole series.
- vCards and calendar files are parsed 10 per request, Stalwart's default limit.
- The release now points `deploy/.env.example` and `deploy/quadlet/kontext.container` at the new
  image version.

## 0.1.5 – 2026-10-27

- Calendar: invitations in Kontext's look, answered with one click without an account (needs
  `STALWART_ADMIN_KEY`); suggestions of colleagues in the attendee field; the end follows the
  start.
- Place suggestions for an appointment's location (Photon, OpenStreetMap) and "In Karten öffnen".
- Photos of people: profile photos, contact photos, a face next to the mail.
- Contacts: "Weitere Kontakte" and "Zusammenführen und korrigieren", as in Google Contacts.
- Chat: voice messages; on a phone the screen stays in place with the keyboard and back goes back.
- Phone tab bar: choose which apps sit in it (*Einstellungen → Darstellung*).
- Reading: a centred column, Outlook-like lines, dark colours; one sidebar width for every module;
  shared mailboxes with their full address in the mail sidebar.
- Settings: two-factor sign-in shows its state at a glance; the settings overview scrolls to its
  last entry on a phone.
- iPhone: no zoom into the search field or the editor, photos save via the share sheet.
- Telephone box: reports its real version instead of "dev".
- **Upgrade:** turn off Stalwart's own RSVP buttons (`httpRsvpEnable: false`, see
  [Stalwart einrichten](https://firsttris.github.io/kontext/installation.html#3-stalwart-einrichten),
  step 10), since Kontext sends invitations itself.

## 0.1.4 – 2026-10-27

- Telephone box: pairs, applies Kontext's configuration and registers at the Fritzbox for real;
  starts cleanly with Podman; its image `tristanteu/kontext-box` is published from this version
  on. **Upgrade:** a box before v0.1.4 never loads Kontext's configuration and never signs in at
  the Fritzbox – use 0.1.4 or newer.
- Settings → Telefonie follows the box connecting without reloading; the Fritzbox's address
  defaults to `192.168.178.1`.
- Backups also with Podman Quadlet (settings in `deploy/backup.env`) and to SFTP targets (the S3
  keys only for S3). **Upgrade (Quadlet):** create `deploy/backup.env` as described under
  [Backups](https://firsttris.github.io/kontext/installation.html#5-backups).
- Deployment: secrets in `deploy/.env` and the Quadlet env files are ignored by git; Stalwart's
  admin listens on `127.0.0.1` (SSH tunnel), Tailscale optional; the guide
  [VPS einrichten](https://firsttris.github.io/kontext/vps.html).

## 0.1.3 – 2026-10-26

- Security fixes from a review before the first deployment, among them: Kontext limits wrong
  passwords itself so Stalwart no longer bans its address; attachments can no longer run as pages
  of Kontext; changes with the session cookie only from Kontext's own pages; agents see only the
  task boards the app shows; the placeholder secrets from `.env.example` are refused.
- The Kontext container runs as the user `bun` instead of root. **Upgrade:** a data volume from an
  older version still belongs to root; hand it over once
  (`docker compose -f deploy/compose.yaml run --rm --user root --entrypoint chown kontext -R bun:bun /data`),
  then start as usual.
- **Upgrade:** enter Kontext's container network `10.89.250.0/24` in Stalwart as an allowed IP and
  set ban periods
  ([Stalwart einrichten](https://firsttris.github.io/kontext/installation.html#3-stalwart-einrichten),
  steps 6 and 7).

## 0.1.2 – 2026-10-26

- No changes to the code since 0.1.1; the same state released again.

## 0.1.1 – 2026-10-26

The first release.

- Mail on Stalwart over JMAP: shared mailboxes, all inboxes in one list, categories, rules on the
  server, search like Gmail, snooze, undo send and send later, text snippets, read receipts,
  unsubscribe, pictures from trusted senders, printing, picking several mails, other mailboxes
  (Gmail, GMX & Co.).
- Calendar and contacts, with availability when inviting and a video meeting per event.
- Tasks: list and Kanban board per mailbox, from mails and rules, repeating, reminders by push,
  CalDAV task lists.
- Team chat with threads, reactions, files, mails as cards, and calls and video over LiveKit.
- Telephony through a telephone box at the Fritzbox.
- Encryption: OpenPGP, S/MIME, "Vertraulich senden", confidential chat conversations.
- Documents with Schreibzeug, AI agents over MCP, notifications and Web Push, the app as a PWA.
- Company admin: people, shared mailboxes and rights, moving in from Microsoft 365, IMAP and
  Outlook (PST).
