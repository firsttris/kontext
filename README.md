<div align="center">

<h1>Kontext</h1>

**Mail, calendar and contacts that belong to you – like Google Workspace, but on your own server.**<br>
Shared mailboxes, a team calendar and contacts that connect everything: every customer's mails and appointments at a glance.<br>
For freelancers, trades, law firms and small and mid-sized businesses – and for everyone who self-hosts. Made in Europe, for Europe.

**English** · [Deutsch](README.de.md)

[![CI](https://github.com/firsttris/kontext/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/kontext/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-firsttris.github.io%2Fkontext-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/kontext/)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Stalwart 0.16](https://img.shields.io/badge/Stalwart-0.16-18181b)](https://stalw.art)

```bash
docker compose -f deploy/compose.yaml up -d
```

[Who it's for](#-who-is-it-for) •
[Privacy](#-your-data-your-rules) •
[Installation](#-installation) •
[Features](#-features) •
[Modules](#-modules) •
[FAQ](#-faq) •
[Documentation](https://firsttris.github.io/kontext/)

<img src="docs/screenshots/mail.png" alt="Kontext in the browser: inbox with folders, shared mailboxes info@ and rechnung@, categories and an open mail with a preview of its PDF attachment" width="900">

</div>

## 💡 Why Kontext?

Google Workspace and Microsoft 365 are convenient – but every user costs money every month, and
the data sits with a US corporation. Kontext feels the same in the browser and on the phone, but
runs on **your** server: a small VPS from about €5 a month (e.g. IONOS or Hetzner) or a machine of
your own.

- **You own everything**: mails, appointments and contacts live on your server, not with a provider.
- **No per-seat pricing**: ten people cost the same as one; you pay for the server.
- **Context instead of silos**: every contact with their latest mails and upcoming appointments, categories and rules for the whole team – a small CRM without another tool.
- **Shared mailboxes**: info@ and invoices@ for the team, with rights per person.
- **Phone and desktop alike**: every view is built for the phone; install it as an app on any device – no app store needed.
- **Open**: open source (AGPL), standard protocols (JMAP, IMAP, CalDAV, CardDAV) – every phone and mail program keeps working.

## 👥 Who is it for?

- **Freelancers and the self-employed**: your own address, calendar and customers in one place, for a few euros a month instead of a subscription per service.
- **Trades, law firms, practices, SMEs**: shared mailboxes, a company calendar, out-of-office with a deputy, onboarding and clean offboarding – with a company admin area the boss can use without IT skills.
- **Self-hosters**: one Docker Compose setup with Stalwart as the mail server; backups and updates are documented.

## 🔒 Your data, your rules

- **GDPR**: the data stays on your server, in a European data centre if you like. No trackers, no ads, no sharing; the only data processing agreement you need is with your hosting provider.
- **GoBD** (German retention rules): Kontext supports compliant retention – nothing is deleted when someone leaves, and backups go encrypted to S3 storage with Object Lock, so they cannot be altered. (Compliance also depends on the company's processes and documentation; the software is one part of it.)
- **No lock-in**: take mails, contacts and calendars with you any time via IMAP, vCard and iCalendar; moving *to* Kontext is built in.
- **Secure**: two-factor sign-in, mails rendered in an isolated frame, warnings about forged senders.

## 🚀 Installation

On a server with Docker, your own domain and open ports 25, 80, 443, 465, 587 and 993:

```bash
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env      # domain, mail server name, backup target
docker compose -f deploy/compose.yaml up -d
```

Then create the domain, DKIM and users in Stalwart's admin (port 8080, over Tailscale only) and
sign in at `https://<your domain>`. DNS records, backups and updates are in the
[installation guide](https://firsttris.github.io/kontext/installation.html) (German). Ten users run
fine on a VPS with 2 vCPUs and 4 GB RAM.

## ✨ Features

### ✉️ Mail

- **Shared mailboxes**: info@ and co. appear in every member's sidebar and are labelled as such; replies go out as info@, with the name of the person who answered. Read-only mailboxes show only what is allowed.
- **All inboxes in one list**: your own mail and info@'s together.
- **Send confidentially** to anyone: recipients with a key get PGP, everyone else a link to your own server and a code you pass on by phone – they read, download and answer there.
- **Other mailboxes**: keep Gmail, GMX, WEB.DE and the like – new mail comes in every two minutes, mail goes out as that address through its own server, and replies go from the address the mail was sent to.
- **Encryption**: your own OpenPGP key, kept locked; send encrypted and signed, read encrypted mail and check signatures right in the browser; keys of others from their mails (Autocrypt), WKD or keys.openpgp.org. See the [concept](docs/encryption.md).
- **Read receipts**: ask for one when sending; answer one with a click, never by itself.
- **Unsubscribe** from newsletters with one click, right at the mail.
- **Pictures from the internet** load only when you ask – or at once for senders you trust (also your contacts), if the mail really comes from them.
- **Categories**: coloured tags like "In progress", "Waiting for reply", "Done" – several per mail, your own ones too, set by rules. In shared mailboxes the whole team sees them: a small task board.
- **Rules**: "if sender, recipient, subject or text … then move to folder, mark, set category, forward" – run on the server as mail arrives, even when Kontext is closed; created from a mail, optionally applied to the inbox. The boss keeps the rules of shared mailboxes.
- **Many mails at once**: pick them (also with Shift-click or `x`) and archive, delete, mark read, categorise or move them together.
- **Protection against forged mail**: a warning above the mail when the sender is not verified, someone outside pretends to be your company, or replies go to another address; "Show details" shows the checks (SPF, DKIM, DMARC, spam score).
- **Mark as spam**: one click (or `!`); "Not spam" brings it back – the spam filter learns from both.
- **Folders and subfolders**: move mails by menu or drag and drop, also between info@ and your own folders.
- **Rich text writing**, replies with quotes, attachments, suggestions from your contacts.
- **Who is writing?** On wide screens the sender is shown next to the mail, with company, upcoming appointments and latest mails.
- **Attachments with previews**: photos and the first page of a PDF as thumbnails.
- **Search like Gmail**: across folders and mailboxes, with operators such as `from:`, `to:`, `subject:`, `has:attachment`, `label:`, `in:info@`, `after:`/`before:`.
- **Conversations without the clutter**: the list stays as mail comes in; reading a mail shows the earlier mails of the conversation and the answers since, quotes folded away. In shared mailboxes you see who answered ("Jonas · 14:02"). Grouping like Gmail is a switch away.
- **Undo send and send later**: a few seconds to take a mail back; "tomorrow at 8" or any time, and the server sends it then – even with your computer off.
- **Snooze ("Wiedervorlage")**: a mail out of the way until tomorrow, Monday or any time; then it is back on top of the inbox, unread – even with Kontext closed, and in info@ for the whole team to see.
- **Text snippets**: standard answers in two clicks, your own and shared ones for info@ & co.; `{Name}` becomes the recipient.
- **Print**: just the mail, neatly on A4 (also with Ctrl+P).
- **Always current**: new mail and colleagues' changes appear without reloading (JMAP push).

### ✅ Tasks

- **Tasks for you and the team**: My tasks, Today, Upcoming, Done; a board for your own mailbox and one per shared mailbox (info@, rechnung@).
- **List or Kanban**: grouped by due date, or as a board with Open, In progress, Waiting, Done – drag cards between columns.
- **From a mail**: "Task" (or `t`) turns a mail into a task with its subject, due date and assignee; the mail then shows its task.
- **In Thunderbird and on your phone**: your boards as task lists over CalDAV (Thunderbird, DAVx⁵ with tasks.org, Apple Reminders), both ways.
- **Tasks from rules**: a mail rule can make a task of every matching mail, also with Kontext closed.
- **Your own columns** per board ("Material ordered" …) and **repeating tasks** (daily, on workdays, weekly, monthly, yearly).
- **Quick entry**: "Call Hoffmann tomorrow" in German ("Rückruf Hoffmann morgen") is due tomorrow; checklists, notes, assignees.
- **Everywhere in Kontext**: a contact shows their open tasks, the calendar shows what is due on each day, the bell shows tasks given to you and what is due today. Reminders arrive as notifications even with Kontext closed. "Create tasks" makes one task per selected mail.
- **Live**: a colleague's new or moved task shows up at once.

### 💬 Team chat

- **Channels**: #allgemein for everyone, one per shared mailbox (info@, rechnung@) for whoever works in it, and your own like #baustelle-hoffmann with chosen members.
- **Direct messages** to one colleague or a few, with "read".
- **Live**: messages, "Sandra is typing …" and who is online, without reloading; unread counts on Chat and on the app icon.
- **@mentions** with suggestions while you type; a mention or a direct message reaches your phone, also with Kontext closed.
- **Photos and files**: from the phone's camera, by drag and drop or paste; photos are made smaller before sending.
- **Mails, tasks and contacts as cards**: "Discuss" on a mail (`b`) talks about it in a channel instead of forwarding it internally; the mail then shows where it was discussed. Only who may open the mailbox opens the card – nothing is copied.
- **Threads and reactions**: answer a message in its thread without filling the channel; 👍 ✅ 🎉 instead of yet another "ok".
- **Share a mail as a copy** with its attachments, for colleagues who cannot open the mailbox.
- **Task from a message**, linked both ways.
- **Calls and video calls** right from a conversation: ring a colleague, or start a meeting in a channel that others join; mute, camera, share your screen, and the call stays open while you switch to mail; missed calls and call lengths stay in the conversation. Runs on your own server ([LiveKit](https://github.com/livekit/livekit), optional).
- **Phone calls in Kontext**: a small telephone box in the office joins your Fritzbox as an IP phone. Calls ring in Kontext with who it is (contact, company, last mail, next appointment), you answer in the browser or at the desk phone, call out from any contact, and missed calls stay in a list with notes and "call back".
  - A missed call leaves a "call back" task on the board you choose; it ticks itself off once someone talked to that number.
  - **Mailbox**: if nobody answers, the box plays your greeting (spoken into the browser or uploaded) and records a message; it arrives as a mail with the recording and can be played back at the call.
  - **Opening hours** with lunch break, closed days and the public holidays at one click: outside them nothing rings, callers hear your closing greeting and may leave a message. The box decides by itself, also when Kontext is out of reach.
  - **Hand a call on** to a colleague (it rings for them, you leave once they are on) or to any number or a handset at the Fritzbox (`**610`): the box dials it into the call and you hand over once it is answered.
  - **Hold, consult, three-way**: hold music for the caller, ask a colleague in first, bring the caller back and talk together, or leave the two of them to it.
  - **Who rings when**: everyone at once or one after another (then all), and a mobile phone that rings too after a while.
  - **Direct numbers**: more numbers of the line, each ringing for its own people, who also call out with it.
  - **Snom desk phones** sign in at the box and set themselves up from it: they ring with Kontext, reach each other by short number, and calls can be handed to them.
  - **Presence**: "on the phone" next to colleagues in the chat; *Do not disturb* or *Away until …* and it rings for the others instead (your desk phone stays quiet too).
  - **Voice menu**: "For service press 1 …" – each key rings for its people or goes to the mailbox.
- **Search** across all your channels; edit or delete your own messages; mute, leave or delete channels.
- **Retention** set by the company admin (30 days to 5 years, or for ever): older messages, photos and files are deleted by themselves.
- **On the phone**: its own tab, conversations as bubbles.

### 📅 Calendar

- **Day, week, month and list**, drag to move, recurring events with exceptions.
- **Video meeting per event**: one click adds a link; customers join in the browser without an account, once someone of your company is there.
- **Share calendars** with colleagues – to read or to edit; **invitations** with accept and decline.
- **On the phone**: day view with a week strip, month and list.

### 👥 Contacts

- **The customer at a glance**: latest mails and upcoming appointments with this contact.
- **Groups** such as "Suppliers" to write to with one mail; **vCard import and export**.
- **Share address books** with colleagues – to read or to edit.

### ⚙️ Settings

- **Signature per sender address**, **out-of-office reply** with dates, **two-factor sign-in** (authenticator app).
- **Light or dark**, **keyboard shortcuts** like Gmail (`?` shows all).
- **An app on every device**: install Kontext from the browser (desktop, Android, iPhone) with its own window and icon, unread count on the icon, starts without network; share photos and files from other apps straight into a new mail; open `mailto:` links in Kontext. New versions arrive reliably and load when you click "Reload".
- **Notifications**: a bell with invitations, today's appointments and new mail; on your devices also with Kontext closed (Web Push, end-to-end encrypted): new mail, direct messages, @mentions and incoming calls.
- **Storage at a glance**: a thin ring around your avatar shows how full the mailbox is.

### 🏢 Company admin

- **Add people**, reset passwords and second factors, **lock access**.
- **Shared mailboxes** with rights per person: no access, read only, or read and send; extra addresses like accounting@.
- **Out-of-office for colleagues** with a deputy, **company signature** for everyone.
- **Offboarding**: lock access, hand over the mailbox, forward, auto-reply – nothing is deleted.
- **Move in** from Microsoft 365, Gmail and other IMAP providers (with folders and categories, then kept in sync), from Outlook (PST) and from a Google export.

## 🧩 Modules

The core stays lean: mail, calendar, contacts and the company admin area. On top come modules a
business switches on when it needs them – whoever doesn't, never sees them.

| Module | Status |
| --- | --- |
| Mail, calendar, contacts, company admin | ✅ available |
| Tasks and Kanban board | ✅ available |
| Team chat | ✅ available |
| Calls and video meetings in the chat | ✅ available |
| Telephony through the Fritzbox (telephone box) | 🧪 being tested |
| Work reports (e.g. for trades) | planned |

What comes next is in the [roadmap](ROADMAP.md) (German).

## 📸 Screenshots

<table>
  <tr>
    <td><img src="docs/screenshots/shared-mailbox.png" alt="Shared mailbox info@: a customer enquiry about a heat pump with the category In progress"></td>
    <td><img src="docs/screenshots/compose.png" alt="Writing a reply with the formatting bar, quote and sender selection"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/calendar.png" alt="Calendar week view with site meeting, maintenance appointment and month overview"></td>
    <td><img src="docs/screenshots/contacts.png" alt="Contact Markus Hoffmann with upcoming appointments and latest mails"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/tasks-board.png" alt="Kanban board of the shared mailbox info@ with Open, In progress, Waiting and Done"></td>
    <td><img src="docs/screenshots/chat.png" alt="Team chat channel with a site report, a shared customer mail as a card and a task made from a message"></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mail-dark.png" alt="Inbox in the dark theme" width="720">
</p>

<p align="center">
  <img src="docs/screenshots/phone-mail.png" alt="Inbox on the phone with tab bar" width="200">
  <img src="docs/screenshots/phone-read.png" alt="Reading a mail on the phone" width="200">
  <img src="docs/screenshots/phone-calendar.png" alt="Calendar day view on the phone" width="200">
  <img src="docs/screenshots/phone-chat.png" alt="Team chat on the phone with bubbles, a file and a mail card" width="200">
</p>

## 🔀 Kontext and the alternatives

|                                                                 | What it is                                       | How Kontext differs                                                |
| --------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------ |
| [Google Workspace](https://workspace.google.com)                | Gmail, Calendar, Drive as a per-user subscription | your own server, no per-seat cost, data in Europe                  |
| [Microsoft 365](https://www.microsoft.com/microsoft-365)        | Outlook and Office as a per-user subscription     | runs in the browser without Outlook, data on your own server       |
| [Roundcube](https://roundcube.net), [SOGo](https://www.sogo.nu) | proven webmail clients                           | modern interface, built for the phone, contacts with customer view |
| Bulwark                                                         | JMAP webmail for Stalwart                        | calendar, contacts, company admin, team rules and categories       |

## ❓ FAQ

### What does it cost?

The software is free (AGPL). You need a server – a VPS from about €5 a month – and someone who
sets it up and keeps it updated.

### Can it run on my own PC?

Yes, Kontext runs wherever Docker runs. To receive mail from the internet, though, the machine
needs port 25 reachable from outside, a fixed IP address and a reverse DNS entry; home internet
connections usually block port 25. At home it works best with a mail relay in front – a small VPS
is simpler.

### Is it GDPR compliant?

It is built for it: the data stays on your server, without trackers or third parties. You sign a
data processing agreement with your hosting provider; with a server in your own building not even
that.

### Do iPhone, Android, Outlook and Thunderbird keep working?

Yes. Stalwart speaks IMAP, SMTP, CalDAV and CardDAV; every mail program and phone can connect
directly. Kontext is the browser interface on top.

### Can I move from Gmail, Microsoft 365 or Outlook?

Yes, under *Settings → Company → Move*: connect IMAP mailboxes (kept in sync until the move is
finished), Microsoft 365 through an app in the company's Microsoft account, Outlook as a PST file,
contacts and calendars from a Google export.

### Can I keep using my Gmail address?

Yes, under *Settings → Other mailboxes*: enter the address and an (app) password. New mail comes
into Kontext, and you send as that address through the provider's server, so recipients see it as
genuine. Nothing is deleted at the provider.

### Which languages?

The app is in German for now; English and other European languages are planned.

## 📚 Documentation

The full documentation (German) is at **[firsttris.github.io/kontext](https://firsttris.github.io/kontext/)**:
[installation](https://firsttris.github.io/kontext/installation.html),
[architecture](https://firsttris.github.io/kontext/architecture.html),
[development](https://firsttris.github.io/kontext/development.html).

## 🛠️ Development

Needs [Bun](https://bun.sh) 1.4 and Linux or macOS.

```bash
git clone https://github.com/firsttris/kontext && cd kontext
bun install
bun run dev   # Stalwart with test data, server and app: http://localhost:5173
```

Sign in as `jonas@weber-haustechnik.test` / `kaffee-werkbank-kontext` (the boss, sees the company
admin too); `anna@`, `sandra@` and `max@` share the password, info@ and rechnung@ are shared
mailboxes. `bun run dev:stalwart -- --fresh --seed` resets the test data.

React, TanStack Router/Query, Tailwind and Tiptap in the browser; a small Bun server with Hono and
Better Auth for sign-in and JMAP to Stalwart.

## 🤝 Contributing

Issues and pull requests are welcome. A good bug report names the browser or phone, the view and
what was shown (a screenshot helps). Before a pull request please run
`bun run check && bun run e2e`.

---

<div align="center">

⭐ Like Kontext? A [star on GitHub](https://github.com/firsttris/kontext) helps others find it.<br>
🐛 [Report a bug](https://github.com/firsttris/kontext/issues/new) · 💡 [Suggest a feature](https://github.com/firsttris/kontext/issues/new)

<sub>License: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel and contributors<br>
Modified versions you distribute or run for others must offer their source code under the AGPL; a commercial license without these obligations is available from <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Kontext is not affiliated with Stalwart Labs, Google or Microsoft.</sub>

</div>
