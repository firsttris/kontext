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
- **Print**: just the mail, neatly on A4 (also with Ctrl+P).
- **Always current**: new mail and colleagues' changes appear without reloading (JMAP push).

### ✅ Tasks

- **Tasks for you and the team**: My tasks, Today, Upcoming, Done; a board for your own mailbox and one per shared mailbox (info@, rechnung@).
- **List or Kanban**: grouped by due date, or as a board with Open, In progress, Waiting, Done – drag cards between columns.
- **From a mail**: "Task" (or `t`) turns a mail into a task with its subject, due date and assignee; the mail then shows its task.
- **Quick entry**: "Call Hoffmann tomorrow" in German ("Rückruf Hoffmann morgen") is due tomorrow; checklists, notes, assignees.
- **Live**: a colleague's new or moved task shows up at once.

### 💬 Team chat

- **Channels**: #allgemein for everyone, one per shared mailbox (info@, rechnung@) for whoever works in it, and your own like #baustelle-hoffmann with chosen members.
- **Direct messages** to one colleague or a few, with "read".
- **Live**: messages, "Sandra is typing …" and who is online, without reloading; unread counts on Chat and on the app icon.
- **@mentions** with suggestions while you type; a mention or a direct message becomes a device notification when Kontext is in the background.
- **On the phone**: its own tab, conversations as bubbles.

### 📅 Calendar

- **Day, week, month and list**, drag to move, recurring events with exceptions.
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
- **Notifications**: a bell with invitations, today's appointments and new mail; optionally as device notifications.
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
| Team chat | ✅ available (files and mail cards next) |
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
</table>

<p align="center">
  <img src="docs/screenshots/mail-dark.png" alt="Inbox in the dark theme" width="720">
</p>

<p align="center">
  <img src="docs/screenshots/phone-mail.png" alt="Inbox on the phone with tab bar" width="240">
  <img src="docs/screenshots/phone-read.png" alt="Reading a mail on the phone" width="240">
  <img src="docs/screenshots/phone-calendar.png" alt="Calendar day view on the phone" width="240">
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
