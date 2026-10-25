<div align="center">

<h1>Kontext: self-hosted email, calendar and team chat for small businesses</h1>

**The open-source alternative to Google Workspace and Microsoft 365 that runs on your own server.**<br>
Mail with shared mailboxes, calendar, contacts, tasks, team chat, telephony (CTI) and documents in one web app for desktop and phone, every customer's mails, calls and appointments at a glance.<br>
No per-user fees, no US cloud: GDPR-friendly, built on the Stalwart mail server, installed with Docker Compose.

**English** · [Deutsch](README.de.md)

[![CI](https://github.com/firsttris/kontext/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/kontext/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-firsttris.github.io%2Fkontext-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/kontext/)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Stalwart 0.16](https://img.shields.io/badge/Stalwart-0.16-18181b)](https://stalw.art)
[![JMAP](https://img.shields.io/badge/JMAP-IMAP%20%7C%20CalDAV%20%7C%20CardDAV-0f766e)](https://firsttris.github.io/kontext/architecture.html)
[![MCP](https://img.shields.io/badge/AI%20agents-MCP-d97757)](#-ai-agents-mcp)

```bash
docker compose -f deploy/compose.yaml up -d
```

[Install](#-install) •
[Features](#-features) •
[Screenshots](#-screenshots) •
[Alternatives](#-kontext-and-the-alternatives) •
[FAQ](#-faq) •
[Documentation](https://firsttris.github.io/kontext/)

<img src="docs/screenshots/mail.png" alt="Kontext self-hosted webmail: inbox with folders, the shared mailboxes info@ and rechnung@, categories and an open mail with a preview of its PDF attachment" width="900">

</div>

## 💡 Why Kontext?

Google Workspace and Microsoft 365 are convenient, but you pay for every user every month and your
mail sits with a US corporation. Kontext feels just as familiar in the browser and on your phone,
but runs on **your** server: a small VPS from about €5 a month (Hetzner, IONOS, …) or a machine of
your own.

**🇪🇺 Made in Europe**

- **Your data stays yours**: mails, appointments and contacts live on your server, in Europe if you like. No trackers, no ads.
- **No per-seat pricing**: ten people cost the same as one; you only pay for the server.
- **Everything about a customer in one place**: open a contact and see their latest mails, next appointments and open tasks. A small CRM without another tool.
- **Made for teams**: shared mailboxes like info@ and invoices@, a team calendar, tasks on a Kanban board, a team chat with video calls and documents shared in the team.
- **The phone knows the customer**: calls from your Fritzbox ring in Kontext with the caller's contact, last mail and next appointment (CTI).
- **Works with what you have**: open standards (JMAP, IMAP, CalDAV, CardDAV), so Outlook, Thunderbird, iPhone and Android keep working. Moving in from Gmail, Microsoft 365 and Outlook is built in.

Kontext is made for freelancers, trades, law firms, practices and small and mid-sized businesses,
and for everyone who self-hosts.

## 🚀 Install

You need a Linux server with Docker, your own domain and open ports 25, 80, 443, 465, 587 and 993:

```bash
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env      # domain, mail server name, backup target
docker compose -f deploy/compose.yaml up -d
```

Then create your domain, DKIM and users in Stalwart's admin and sign in at `https://<your domain>`.
Ten users run fine on a VPS with 2 vCPUs and 4 GB RAM. DNS records (MX, SPF, DKIM, DMARC), backups
and updates are in the [installation guide](https://firsttris.github.io/kontext/installation.html).

## ✨ Features

Every feature in detail: [Features](https://firsttris.github.io/kontext/features.html) (German).

### ✉️ Email

- **Shared mailboxes**: info@ and co. in every member's sidebar, replies go out as info@ with the name of the person who answered.
- **Search like Gmail** across all folders and mailboxes, with `from:`, `has:attachment`, `in:info@` and more.
- **Rules, categories and snooze** that run on the server, even with Kontext closed; in shared mailboxes the whole team sees them.
- **Undo send, send later, text snippets**, rich text and attachments with previews.
- **Encryption**: OpenPGP in the browser, or send confidentially to anyone through a link on your own server.
- **Protection against phishing**: a warning when a sender is forged (SPF, DKIM, DMARC).
- **Keep your Gmail or GMX address**: fetch its mail and send as it.

### 📅 Calendar, contacts and tasks

- **Calendar** with day, week, month and list, invitations, shared calendars and a video link per event.
- **Who is free?** Free and busy times of colleagues and the next slot that suits everyone.
- **Contacts** with a customer view, groups, shared address books and vCard import.
- **Tasks and Kanban boards** for you and per shared mailbox; turn a mail into a task with one key.

### 💬 Team chat and video calls

- **Channels and direct messages**, threads, reactions, @mentions, photos and files.
- **Discuss a mail** in a channel instead of forwarding it internally.
- **Calls and video meetings** in the browser, on your own server ([LiveKit](https://github.com/livekit/livekit)); customers join a meeting from the calendar without an account.

### 📞 Telephony and CTI with the Fritzbox

A small telephone box in the office joins your Fritzbox as an IP phone (in testing).

- **Caller ID with your CRM**: incoming calls ring in Kontext with the contact, company, last mail and next appointment.
- **Click to call** from any contact, answer in the browser or at the desk phone; Snom desk phones set themselves up.
- **Voicemail as mail**, opening hours with public holidays, a voice menu ("press 1 for service") and fax as PDF.
- **Hand calls on**, hold, consult and three-way calls; presence and *Do not disturb* in the chat.
- **Missed calls become tasks** that tick themselves off once someone called back; call statistics for the team.

### 📄 Documents and files

With [Schreibzeug](https://github.com/firsttris/schreibzeug), the open-source office suite in the browser (optional).

- **Word, Excel, PowerPoint and PDF** open and edit in Kontext, without a second sign-in; real .docx, .xlsx and .pptx files, edited together in real time.
- **A folder per shared mailbox**: info@ and invoices@ get their own documents, with the mailbox's rights.
- **Attachments into Documents** and back: save a mail's attachment to a folder, attach a file from Documents.
- **Files where they belong**: share a document in the chat, link it to a task, a contact or an appointment.

### 🤖 AI agents (MCP)

- **Claude and other agents work with your mail**: add Kontext as a connector and sign in in the browser (OAuth), or give an agent an access key.
- **Ask about a customer**: the agent looks up latest mails, appointments, contacts and tasks across your mailboxes, with your rights.
- **Safe by design**: if you allow it, it writes drafts and creates appointments, contacts and tasks. It never sends or deletes; every change is logged and every connection can be revoked.

### 🏢 For the boss

- **Company admin without IT skills**: add people, reset passwords, lock access, set up shared mailboxes with rights per person.
- **Out-of-office with a deputy** and one company signature for everyone.
- **Offboarding without data loss**: hand over the mailbox and forward; nothing is deleted.
- **Move in** from Microsoft 365, Gmail and other IMAP providers (kept in sync until you finish), from Outlook (PST) and from a Google export.

### 📱 On every device

- **Built for the phone**: every view works on a small screen, with a tab bar.
- **Installable app** on desktop, Android and iPhone, without an app store; push notifications for new mail, messages and calls, also with Kontext closed.
- **Light and dark**, keyboard shortcuts like Gmail.

## 📸 Screenshots

<table>
  <tr>
    <td><img src="docs/screenshots/shared-mailbox.png" alt="Shared mailbox info@ in Kontext: a customer enquiry about a heat pump with the category In progress"></td>
    <td><img src="docs/screenshots/calendar.png" alt="Team calendar in week view with site meeting, maintenance appointment and month overview"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/contacts.png" alt="Contact Markus Hoffmann with upcoming appointments and latest mails, a small CRM"></td>
    <td><img src="docs/screenshots/tasks-board.png" alt="Kanban task board of the shared mailbox info@ with Open, In progress, Waiting and Done"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/chat.png" alt="Team chat channel with a site report, a customer mail shared as a card and a task made from a message"></td>
    <td><img src="docs/screenshots/mail-dark.png" alt="Kontext webmail inbox in the dark theme"></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/phone-mail.png" alt="Email inbox on the phone with tab bar" width="200">
  <img src="docs/screenshots/phone-read.png" alt="Reading a mail on the phone" width="200">
  <img src="docs/screenshots/phone-calendar.png" alt="Calendar day view on the phone" width="200">
  <img src="docs/screenshots/phone-chat.png" alt="Team chat on the phone with bubbles, a file and a mail card" width="200">
</p>

## 🔀 Kontext and the alternatives

Kontext is made for small businesses that want their own server without giving up the comfort of
Gmail and Outlook.

| | What it is | Where Kontext differs |
|---|---|---|
| [Google Workspace](https://workspace.google.com) | Gmail, Calendar and Drive as a per-user subscription | your own server, no per-seat cost, data in Europe |
| [Microsoft 365](https://www.microsoft.com/microsoft-365) | Outlook and Office as a per-user subscription | runs in the browser without Outlook, data on your own server |
| [Nextcloud](https://nextcloud.com) | file sync with mail, calendar and Talk as apps | mail first: shared mailboxes, rules and the customer view at the centre |
| [Roundcube](https://roundcube.net), [SOGo](https://www.sogo.nu) | proven webmail and groupware | modern interface, built for the phone, tasks and chat included |
| Bulwark | JMAP webmail with calendar and contacts for Stalwart | tasks, team chat, telephony (CTI), documents, AI agents and a company admin area |

## ❓ FAQ

### What does Kontext cost?

The software is free and open source (AGPL). You need a server, a VPS from about €5 a month, and
someone who sets it up and keeps it updated.

### Is it a self-hosted alternative to Google Workspace or Microsoft 365?

Yes. Mail, calendar, contacts, tasks, chat, telephony and documents run on your own server, in the browser and
on the phone, without a fee per user.

### Is it GDPR compliant?

It is built for it: your data stays on your server, without trackers or third parties. You only
need a data processing agreement with your hosting provider. Backups go encrypted to S3 storage
with Object Lock, and nothing is deleted when someone leaves.

### Do Outlook, Thunderbird, iPhone and Android keep working?

Yes. Stalwart speaks IMAP, SMTP, CalDAV and CardDAV, so every mail program and phone connects
directly. Kontext is the web interface on top.

### Can I move from Gmail, Microsoft 365 or Outlook?

Yes, under *Settings → Company → Move*: IMAP mailboxes (kept in sync until the move is finished),
Microsoft 365, Outlook PST files and Google exports with contacts and calendars.

### Can Claude or ChatGPT read my mail in Kontext?

Only if you connect an agent. Kontext is an MCP server: an agent sees what you may see, writes at
most drafts and never sends. You can revoke every connection in the settings.

### Does Kontext work with my Fritzbox and desk phones?

Yes. The telephone box joins the Fritzbox as an IP phone: calls ring in Kontext and at Snom desk
phones, with the caller's contact and latest mail. It is in testing right now.

### Can I edit Word and Excel files in Kontext?

Yes, with the optional Documents module ([Schreibzeug](https://github.com/firsttris/schreibzeug)):
Word, Excel, PowerPoint and PDF in the browser, with folders per shared mailbox.

### Can it run on my own PC?

Yes, wherever Docker runs. To receive mail from the internet the machine needs port 25 reachable
from outside, a fixed IP address and reverse DNS; home connections usually block port 25, so a
small VPS is simpler.

### Which languages?

The app is in German for now; English and other European languages are planned.

## 📚 Documentation

The full documentation (German) is at **[firsttris.github.io/kontext](https://firsttris.github.io/kontext/)**.

| | |
|---|---|
| [Features](https://firsttris.github.io/kontext/features.html) | everything Kontext does, area by area |
| [Installation](https://firsttris.github.io/kontext/installation.html) | server, DNS (MX, SPF, DKIM, DMARC), first start, backups, updates |
| [Architecture](https://firsttris.github.io/kontext/architecture.html) | how the app, its server, Caddy and Stalwart fit together |
| [Encryption](https://firsttris.github.io/kontext/encryption.html) | OpenPGP, S/MIME and confidential sending |
| [Development](https://firsttris.github.io/kontext/development.html) | local Stalwart with test data, tests, CI, releases |

## 🛠️ Development

Needs [Bun](https://bun.sh) 1.4 and Linux or macOS.

```bash
git clone https://github.com/firsttris/kontext && cd kontext
bun install
bun run dev   # Stalwart with test data, server and app: http://localhost:5173
```

Sign in as `jonas@weber-haustechnik.test` / `kaffee-werkbank-kontext` (the boss, sees the company
admin too); `anna@`, `sandra@` and `max@` share the password.

React, TanStack Router and Query, Tailwind and Tiptap in the browser; a small Bun server with Hono
and Better Auth for sign-in and JMAP to Stalwart. Architecture, tests and releases:
[Development](https://firsttris.github.io/kontext/development.html). What comes next is in the
[roadmap](ROADMAP.md) (German).

## 🤝 Contributing

Issues and pull requests are welcome. A good bug report names the browser or phone, the view and
what was shown (a screenshot helps). Before a pull request please run
`bun run typecheck && bun run lint && bun run test && bun run e2e`.

---

<div align="center">

⭐ Like Kontext? A [star on GitHub](https://github.com/firsttris/kontext) helps others find it.<br>
🐛 [Report a bug](https://github.com/firsttris/kontext/issues/new) · 💡 [Request a feature](https://github.com/firsttris/kontext/issues/new)

<sub>License: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel and contributors · <a href="README.de.md">Deutsche Version</a><br>
Changed versions you pass on or run for others must offer their source code under the AGPL; a commercial license without these obligations is available via <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Kontext is not affiliated with Stalwart Labs, Google, Microsoft, Anthropic or AVM.</sub>

</div>
