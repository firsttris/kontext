<div align="center">

<h1>Kontext: mail, calendar, chat and telephony (CTI) for your team – self-hosted and open source</h1>

The self-hosted Google Workspace and Microsoft 365 alternative. Shared mailboxes, a team calendar and contacts that connect everything: every customer's mails, appointments, tasks and calls at a glance.<br>
AGPL, a web app and PWA on top of the Stalwart mail server, no per-seat pricing. Made in Europe.

**English** · [Deutsch](README.de.md)

[![CI](https://github.com/firsttris/kontext/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/kontext/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/firsttris/kontext?logo=github&label=release)](https://github.com/firsttris/kontext/releases/latest)
[![Docker Pulls](https://img.shields.io/docker/pulls/tristanteu/kontext?logo=docker&logoColor=white)](https://hub.docker.com/r/tristanteu/kontext)
[![Platforms](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-lightgrey)](https://hub.docker.com/r/tristanteu/kontext/tags)
[![Docs](https://img.shields.io/badge/docs-firsttris.github.io%2Fkontext-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/kontext/)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Stalwart 0.16](https://img.shields.io/badge/Stalwart-0.16-18181b)](https://stalw.art)
[![JMAP](https://img.shields.io/badge/JMAP-mail%20%7C%20calendar%20%7C%20contacts-0f766e)](https://jmap.io)
[![GDPR](https://img.shields.io/badge/GDPR-data%20on%20your%20server-15803d)](#-your-data-stays-in-europe--with-ai)
[![GoBD](https://img.shields.io/badge/GoBD-nothing%20deleted-15803d)](#-your-data-stays-in-europe--with-ai)
[![Made in Europe](https://img.shields.io/badge/made%20in-Europe-003399)](#-your-data-stays-in-europe--with-ai)

```bash
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env && nano deploy/.env   # domain, replace every change-me
docker compose -f deploy/compose.yaml up -d              # or Podman
```

[Privacy & GoBD](#-your-data-stays-in-europe--with-ai) •
[Why](#-why-kontext) •
[Install](#-install) •
[Features](#-features) •
[Screenshots](#-screenshots) •
[Alternatives](#-kontext-and-the-alternatives) •
[FAQ](#-faq) •
[Documentation](https://firsttris.github.io/kontext/)

<img src="docs/screenshots/mail.png" alt="Kontext self-hosted webmail: inbox with folders, the shared mailboxes info@ and rechnung@, categories and an open mail with a preview of its PDF attachment" width="900">

</div>

## 🇪🇺 Your data stays in Europe – with AI

- **GDPR**: mails, appointments, contacts, chat and calls live on your server, in a European data centre or in your own office. No US provider in between, no trackers, no sharing. The only data processing agreement you need is with your hosting provider.
- **GoBD** (German retention rules): nothing is deleted when someone leaves, and backups go encrypted and unalterable (Object Lock) to S3 storage. The software is one part; the company's processes and its procedure documentation are the other.
- **AI on your terms**: Kontext is an MCP server. You connect the AI assistant you choose; it works with your rights, writes drafts instead of sending, never deletes anything, and every access is logged and can be revoked.
- **No lock-in**: open standards (IMAP, CalDAV, CardDAV), take everything with you any time; moving *to* Kontext is built in.

## 💡 Why Kontext?

Google Workspace and Microsoft 365 are convenient – but every user costs money every month, and
the data sits with a US corporation. Kontext feels the same in the browser and on the phone, but
runs on **your** server: a small VPS from about €5 a month (e.g. IONOS or Hetzner) or a machine of
your own.

- **You own everything**: mails, appointments, contacts, chat and calls live on your server, not with a provider.
- **No per-seat pricing**: ten people cost the same as one; you pay for the server.
- **Context instead of silos**: every contact with their latest mails, upcoming appointments, open tasks and calls – a small CRM without another tool.
- **One app instead of five**: mail, calendar, tasks, team chat with video calls, the office phone and documents, with one sign-in.
- **Phone and desktop alike**: every view is built for the phone, with a tab bar you can fill with the apps you use most; install it as an app on any device – no app store needed.
- **Open**: open source (AGPL), standard protocols (JMAP, IMAP, SMTP, CalDAV, CardDAV) – Outlook, Thunderbird, iPhone and Android keep working.

**Who it's for:** freelancers and the self-employed, trades, law firms, medical practices and
small and mid-sized businesses (with a company admin area the boss can use without IT skills) –
and self-hosters who want a modern web client for [Stalwart](https://stalw.art).

## 🚀 Install

On a server with Docker (or Podman), your own domain and open ports 25, 80, 443, 465, 587 and 993:

```bash
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env      # domain, mail server name, secrets, backup target
chmod 600 deploy/.env                   # replace every change-me: Kontext refuses to start with them
docker compose -f deploy/compose.yaml up -d
```

Then set up Stalwart in its admin (port 8080, only through an SSH tunnel or Tailscale) as the
[guide](https://firsttris.github.io/kontext/installation.html#3-stalwart-einrichten) lists it: the domain and DKIM, the boss's account (everyone else
is added later in Kontext), Kontext's container network `10.89.250.0/24` as an allowed IP
(otherwise wrong passwords can get Kontext itself banned) and the API key for the company admin
(`STALWART_ADMIN_KEY`; without it there is no company admin, no other mailboxes and no answer
buttons in invitations, see [company admin](https://firsttris.github.io/kontext/installation.html#firmenverwaltung-einschalten)). Then sign in at
`https://<your domain>`. Ten users run fine on a VPS with 2 vCPUs and 4 GB RAM.

Calls (LiveKit) and documents (Schreibzeug) are Compose profiles that `.env.example` switches on
(`COMPOSE_PROFILES=calls,documents`): set their secrets and DNS names, or remove them there.
Telephony adds a small box in the office. DNS records, Podman Quadlets, backups and updates are in the
[installation guide](https://firsttris.github.io/kontext/installation.html) (German).

## ✨ Features

| | |
|---|---|
| ✉️ **Mail** | **Shared mailboxes** (info@ with rights per person, replies show who answered), all inboxes in one list, **categories**, **rules on the server**, search like Gmail, snooze, undo send and send later, text snippets, **other mailboxes** (Gmail, GMX, WEB.DE), **warnings about phishing and forged senders**, signatures, out-of-office, live updates over JMAP push · [more →](https://firsttris.github.io/kontext/mail.html) |
| 📅 **Calendar** | Day, week, month and list, recurring events, **invitations answered with one click** without an account, **who is free?** like Outlook's scheduling assistant, a **video meeting per event**, places from OpenStreetMap, shared calendars · [more →](https://firsttris.github.io/kontext/calendar-contacts.html) |
| 👥 **Contacts** | **The customer at a glance**: latest mails, upcoming appointments, open tasks, documents and calls – a small CRM; photos, groups, vCard, other contacts like Gmail, merging duplicates · [more →](https://firsttris.github.io/kontext/calendar-contacts.html#kontakte) |
| ✅ **Tasks** | **List or Kanban board** per mailbox, repeating tasks, **from a mail, a chat message, a rule or a missed call**, quick entry ("Call Hoffmann tomorrow"), reminders as push, CalDAV for Thunderbird and phones · [more →](https://firsttris.github.io/kontext/tasks.html) |
| 💬 **Team chat & video** | Channels and direct messages, @mentions, threads, reactions, **mails, tasks and contacts as cards**, voice messages, **calls, video and screen sharing** on your own server (LiveKit), **end-to-end encrypted conversations** · [more →](https://firsttris.github.io/kontext/chat.html) |
| 📞 **Telephony (CTI)** | **Your Fritzbox and numbers stay**: calls ring in Kontext with the caller's contact, last mail and next appointment, **click to call**, **voicemail as mail**, missed calls become tasks, opening hours and voice menu, transfer and conference, Snom desk phones, fax as PDF · [more →](https://firsttris.github.io/kontext/telephony.html) |
| 🔐 **Encryption** | **OpenPGP** in the browser, **S/MIME** for authorities and law firms, **send confidentially to anyone** through a link to your own server, TLS with MTA-STS and DANE, encrypted backups · [more →](https://firsttris.github.io/kontext/encryption.html) |
| 📄 **Documents** | **Word, Excel, PowerPoint and PDF** in Kontext with [Schreibzeug](https://github.com/firsttris/schreibzeug), a folder per shared mailbox, attachments into documents and back · [more →](https://firsttris.github.io/kontext/documents.html) |
| 🤖 **AI agents (MCP)** | **Kontext is an MCP server**: Claude and other agents look up customers, mails, appointments and tasks with your rights and write drafts – no sending, no deleting, every change logged · [more →](https://firsttris.github.io/kontext/agents.html) |
| 🏢 **Company admin** | **People, shared mailboxes and rights** without IT skills, out-of-office with a deputy, company signature, **offboarding without deleting**, backups at a glance, **moving in from Microsoft 365, Gmail, IMAP and Outlook (PST)** · [more →](https://firsttris.github.io/kontext/company.html) |
| 📱 **On every device** | **An app on desktop, Android and iPhone** (PWA, no app store), push notifications even when closed, a tab bar with your apps, light and dark, two-factor sign-in · [more →](https://firsttris.github.io/kontext/app.html) |

<img src="docs/screenshots/phone-call.png" alt="CTI in Kontext: an incoming call from the Fritzbox rings in the browser with the caller's contact, company, number and last mail, next to the inbox" width="900">

## 📸 Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/shared-mailbox.png" alt="Shared mailbox info@ in Kontext: a customer enquiry about a heat pump with the category In progress"><br><sub><b>Shared mailbox</b> – info@ for the whole team · <a href="https://firsttris.github.io/kontext/mail.html">docs →</a></sub></td>
    <td width="50%"><img src="docs/screenshots/compose.png" alt="Writing a reply in Kontext with the formatting bar, quote and sender selection"><br><sub><b>Writing</b> – rich text, quote, sender · <a href="https://firsttris.github.io/kontext/mail.html#schreiben">docs →</a></sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/calendar.png" alt="Team calendar week view with site meeting, maintenance appointment and month overview"><br><sub><b>Calendar</b> – week, month, availability · <a href="https://firsttris.github.io/kontext/calendar-contacts.html">docs →</a></sub></td>
    <td><img src="docs/screenshots/contacts.png" alt="Contact Markus Hoffmann with upcoming appointments and latest mails, like a small CRM"><br><sub><b>Contacts</b> – the customer at a glance · <a href="https://firsttris.github.io/kontext/calendar-contacts.html#kontakte">docs →</a></sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/tasks-board.png" alt="Kanban board of the shared mailbox info@ with Open, In progress, Waiting and Done"><br><sub><b>Tasks</b> – a Kanban board per mailbox · <a href="https://firsttris.github.io/kontext/tasks.html">docs →</a></sub></td>
    <td><img src="docs/screenshots/chat.png" alt="Team chat channel with a site report, a shared customer mail as a card and a task made from a message"><br><sub><b>Team chat</b> – mails as cards, tasks from messages · <a href="https://firsttris.github.io/kontext/chat.html">docs →</a></sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mail-dark.png" alt="Kontext webmail inbox in the dark theme" width="720">
</p>

<p align="center">
  <img src="docs/screenshots/phone-mail.png" alt="Kontext on the phone: inbox with tab bar" width="200">
  <img src="docs/screenshots/phone-read.png" alt="Reading a mail on the phone" width="200">
  <img src="docs/screenshots/phone-calendar.png" alt="Calendar day view on the phone" width="200">
  <img src="docs/screenshots/phone-chat.png" alt="Team chat on the phone with bubbles, a file and a mail card" width="200">
</p>

## 🔀 Kontext and the alternatives

Kontext is made for a small business that wants Google Workspace comfort on its own server, with
mail, calendar, chat and the office phone in one place.

| | What it is | How Kontext differs |
| --- | --- | --- |
| [Google Workspace](https://workspace.google.com) | Gmail, Calendar, Drive and Meet as a per-user subscription | your own server, no per-seat cost, data in Europe |
| [Microsoft 365](https://www.microsoft.com/microsoft-365) | Outlook, Teams and Office as a per-user subscription | runs in the browser without Outlook, chat and phone included, data on your own server |
| [Nextcloud](https://nextcloud.com) | self-hosted file sync with mail, calendar and Talk as apps | built around mail and the customer: shared mailboxes, team rules and categories, the office phone; files through Schreibzeug |
| [Roundcube](https://roundcube.net), [SOGo](https://www.sogo.nu) | proven webmail and groupware clients for IMAP | modern interface built for the phone, JMAP push, contacts with a customer view, tasks and chat |
| [Zimbra](https://www.zimbra.com), [Open-Xchange](https://www.open-xchange.com) | groupware suites for providers and larger companies | one small server per company, set up in an afternoon, a company admin area for the boss |
| [3CX](https://www.3cx.com), [Placetel](https://www.placetel.de) | phone systems with CTI apps | keeps your Fritzbox and numbers, calls arrive next to the customer's mails, no licence per extension |
| Bulwark | JMAP webmail for Stalwart | calendar, contacts, tasks, chat, telephony and a company admin area |

## ❓ FAQ

<details>
<summary><b>Is there an open-source alternative to Google Workspace and Microsoft 365?</b></summary>

Yes, Kontext: mail with shared mailboxes, calendar, contacts, tasks, team chat with video calls and
the office phone in one web app on your own server, with documents through
[Schreibzeug](https://github.com/firsttris/schreibzeug). See the [installation guide](https://firsttris.github.io/kontext/installation.html).
</details>

<details>
<summary><b>What does it cost?</b></summary>

The software is free (AGPL). You need a server – a VPS from about €5 a month – and someone who
sets it up and keeps it updated.
</details>

<details>
<summary><b>Is there a web interface for the Stalwart mail server?</b></summary>

Yes, that is what Kontext is: a JMAP web client for mail, calendar and contacts on
[Stalwart](https://stalw.art), plus tasks, chat, telephony and a company admin area that manages
Stalwart's accounts and groups. See the [architecture](https://firsttris.github.io/kontext/architecture.html).
</details>

<details>
<summary><b>Does Kontext work with my Fritzbox (CTI)?</b></summary>

Yes. A telephone box in the office registers as an IP phone at the Fritzbox; calls then ring in
Kontext with the caller's contact, last mail and next appointment, and you call out from any
contact. See [Telephony](https://firsttris.github.io/kontext/telephony.html).
</details>

<details>
<summary><b>Can it run on my own PC or NAS?</b></summary>

Yes, Kontext runs wherever Docker or Podman runs. To receive mail from the internet the machine
needs port 25 reachable from outside, a fixed IP address and a reverse DNS entry; home internet
connections usually block port 25. At home it works best with a mail relay in front – a small VPS
is simpler. The telephone box runs on a NAS, a Raspberry Pi or a thin client in the office.
</details>

<details>
<summary><b>Is it GDPR compliant?</b></summary>

It is built for it: the data stays on your server, without trackers or third parties. You sign a
data processing agreement with your hosting provider; with a server in your own building not even
that. For German retention rules (GoBD) nothing is deleted when someone leaves, and backups go
encrypted to S3 storage with Object Lock.
</details>

<details>
<summary><b>Do iPhone, Android, Outlook and Thunderbird keep working?</b></summary>

Yes. Stalwart speaks IMAP, SMTP, CalDAV and CardDAV; every mail program and phone can connect
directly. Kontext is the browser interface on top, and its tasks are CalDAV task lists too.
</details>

<details>
<summary><b>Can I move from Gmail, Microsoft 365 or Outlook?</b></summary>

Yes, under *Settings → Company → Move*: IMAP mailboxes (kept in sync until the move is finished),
Microsoft 365 through an app in the company's Microsoft account, Outlook as a PST file, contacts and
calendars from a Google export. See [Company admin and moving in](https://firsttris.github.io/kontext/company.html).
</details>

<details>
<summary><b>Can I keep using my Gmail address?</b></summary>

Yes, under *Settings → Other mailboxes*: new mail comes into Kontext, and you send as that address
through the provider's server, so recipients see it as genuine.
</details>

<details>
<summary><b>Can I use Claude or other AI agents with my mail?</b></summary>

Yes, Kontext is an MCP server. An agent works with your rights, writes drafts instead of sending,
and never deletes anything. See [AI agents](https://firsttris.github.io/kontext/agents.html).
</details>

<details>
<summary><b>Which languages?</b></summary>

The app is in German for now; English and other European languages are planned.
</details>

## 📚 Documentation

The full documentation (German), with search, is at **[firsttris.github.io/kontext](https://firsttris.github.io/kontext/)**:
every feature in detail, [installation](https://firsttris.github.io/kontext/installation.html),
[architecture](https://firsttris.github.io/kontext/architecture.html) and
[development](https://firsttris.github.io/kontext/development.html). What changed in each release,
with the steps an update needs, is in the [changelog](CHANGELOG.md); what comes next is in the
[roadmap](ROADMAP.md) (German).

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

React, TanStack Router/Query, Tailwind and Tiptap in the browser; a small Bun server with Hono,
Better Auth and SQLite (Drizzle) for sign-in, JMAP to Stalwart, chat and tasks; LiveKit for calls,
Asterisk in the telephone box. Tests, CI and releases: [Development](https://firsttris.github.io/kontext/development.html).

## 🤝 Contributing

Issues and pull requests are welcome. A good bug report names the browser or phone, the view,
what happened and the Kontext version (a screenshot helps); the
[bug report form](https://github.com/firsttris/kontext/issues/new?template=bug_report.yml) asks for
all of it. Security problems please report privately, see [SECURITY.md](SECURITY.md). Before a pull
request please run the checks from [CONTRIBUTING.md](CONTRIBUTING.md):

```bash
bun run typecheck && bun run lint && bun run test && bun run build   # or: bun run check
bun run e2e                                                          # Playwright against its own Stalwart
mkdocs build --strict                                                # when docs/ changed
```

---

<div align="center">

⭐ Like Kontext? A [star on GitHub](https://github.com/firsttris/kontext) helps others find it.<br>
🐛 [Report a bug](https://github.com/firsttris/kontext/issues/new?template=bug_report.yml) · 💡 [Request a feature](https://github.com/firsttris/kontext/issues/new?template=feature_request.yml)

<sub>License: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel and contributors · <a href="README.de.md">Deutsche Version</a><br>
Changed versions you pass on or run for others must offer their source code under the AGPL; a commercial license without these obligations is available via <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Kontext is not affiliated with Stalwart Labs, AVM (FRITZ!Box), Snom, Google, Microsoft or Anthropic.</sub>

</div>
