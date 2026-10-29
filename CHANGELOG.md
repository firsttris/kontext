# Changelog

What changed in each release of Kontext, newest first. The images are `tristanteu/kontext` and
`tristanteu/kontext-box` with the same version; how to update is in the
[installation guide](https://firsttris.github.io/kontext/installation.html#6-updates) (German).
Steps that an update needs beyond raising the version are marked **Upgrade**.

## Unreleased

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
