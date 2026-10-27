<div align="center">

<h1>Kontext: Mail, Kalender, Chat und Telefonie (CTI) für dein Team – selbst gehostet und Open Source</h1>

Die selbst gehostete Alternative zu Google Workspace und Microsoft 365. Gemeinsame Postfächer, ein Kalender fürs Team und Kontakte, die alles verbinden: zu jedem Kunden Mails, Termine, Aufgaben und Anrufe auf einen Blick.<br>
AGPL, eine Web-App und PWA auf dem Mailserver Stalwart, keine Kosten pro Benutzer. Made in Europe.

[English](README.md) · **Deutsch**

[![CI](https://github.com/firsttris/kontext/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/kontext/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/firsttris/kontext?logo=github&label=release)](https://github.com/firsttris/kontext/releases/latest)
[![Docker Pulls](https://img.shields.io/docker/pulls/tristanteu/kontext?logo=docker&logoColor=white)](https://hub.docker.com/r/tristanteu/kontext)
[![Platforms](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-lightgrey)](https://hub.docker.com/r/tristanteu/kontext/tags)
[![Docs](https://img.shields.io/badge/docs-firsttris.github.io%2Fkontext-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/kontext/)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Stalwart 0.16](https://img.shields.io/badge/Stalwart-0.16-18181b)](https://stalw.art)
[![JMAP](https://img.shields.io/badge/JMAP-mail%20%7C%20calendar%20%7C%20contacts-0f766e)](https://jmap.io)
[![DSGVO](https://img.shields.io/badge/DSGVO-Daten%20auf%20deinem%20Server-15803d)](#-deine-daten-bleiben-in-europa--mit-ki)
[![GoBD](https://img.shields.io/badge/GoBD-nichts%20wird%20gel%C3%B6scht-15803d)](#-deine-daten-bleiben-in-europa--mit-ki)
[![Made in Europe](https://img.shields.io/badge/made%20in-Europe-003399)](#-deine-daten-bleiben-in-europa--mit-ki)

```bash
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env && nano deploy/.env   # Domain, jedes change-me ersetzen
docker compose -f deploy/compose.yaml up -d              # oder Podman
```

[Datenschutz & GoBD](#-deine-daten-bleiben-in-europa--mit-ki) •
[Warum](#-warum-kontext) •
[Installation](#-installation) •
[Funktionen](#-funktionen) •
[Screenshots](#-screenshots) •
[Alternativen](#-kontext-und-die-alternativen) •
[FAQ](#-faq) •
[Dokumentation](https://firsttris.github.io/kontext/)

<img src="docs/screenshots/mail.png" alt="Kontext, Webmail auf dem eigenen Server: Posteingang mit Ordnern, gemeinsamen Postfächern info@ und rechnung@, Kategorien und einer geöffneten Mail mit Vorschau des PDF-Anhangs" width="900">

</div>

## 🇪🇺 Deine Daten bleiben in Europa – mit KI

- **DSGVO**: Mails, Termine, Kontakte, Chat und Anrufe liegen auf deinem Server, in einem deutschen Rechenzentrum oder im eigenen Büro. Kein US-Anbieter dazwischen, keine Tracker, keine Weitergabe. Einen Auftragsverarbeitungsvertrag brauchst du nur mit deinem Hoster.
- **GoBD**: Beim Austritt wird nichts gelöscht, Backups gehen verschlüsselt und unveränderbar (Object Lock) auf S3-Speicher. Die Software ist ein Baustein; dazu gehören die Abläufe im Betrieb und eine Verfahrensdokumentation.
- **KI nach deinen Regeln**: Kontext ist ein MCP-Server. Du verbindest den KI-Assistenten, den du willst; er arbeitet mit deinen Rechten, schreibt Entwürfe statt zu senden, löscht nie etwas, und jeder Zugriff wird protokolliert und lässt sich trennen.
- **Kein Lock-in**: offene Standards (IMAP, CalDAV, CardDAV), mitnehmen jederzeit; der Umzug *zu* Kontext ist eingebaut.

## 💡 Warum Kontext?

Google Workspace und Microsoft 365 sind bequem – aber jeder Benutzer kostet jeden Monat, und die
Daten liegen bei einem US-Konzern. Kontext bietet dasselbe Gefühl im Browser und am Handy, läuft
aber auf **deinem** Server: einem kleinen VPS ab etwa 5 € im Monat (z. B. bei IONOS oder Hetzner)
oder einem eigenen Rechner.

- **Alles gehört dir**: Mails, Termine, Kontakte, Chat und Anrufe liegen auf deinem Server, nicht bei einem Anbieter.
- **Keine Kosten pro Kopf**: zehn Mitarbeiter kosten dasselbe wie einer; bezahlt wird der Server.
- **Kontext statt Inseln**: zu jedem Kontakt die letzten Mails, nächsten Termine, offenen Aufgaben und Anrufe – ein kleines CRM ohne Extra-Tool.
- **Eine App statt fünf**: Mail, Kalender, Aufgaben, Team-Chat mit Videocalls, das Firmentelefon und Dokumente, mit einer Anmeldung.
- **Am Handy wie am PC**: jede Ansicht ist fürs Handy gebaut, mit einer Tab-Leiste für die Apps, die man am meisten braucht; als App auf jedem Gerät installierbar – ohne App-Store.
- **Offen**: Open Source (AGPL), Standardprotokolle (JMAP, IMAP, SMTP, CalDAV, CardDAV) – Outlook, Thunderbird, iPhone und Android funktionieren weiter.

**Für wen:** Freelancer und Selbstständige, Handwerk, Kanzleien, Praxen und den Mittelstand (mit
einer Firmenverwaltung, die der Chef ohne IT-Kenntnisse bedient) – und für Selfhoster, die eine
moderne Weboberfläche für [Stalwart](https://stalw.art) suchen.

## 🚀 Installation

Auf einem Server mit Docker (oder Podman), eigener Domain und offenen Ports 25, 80, 443, 465, 587 und 993:

```bash
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env      # Domain, Mailserver-Name, Geheimnisse, Backup-Ziel
chmod 600 deploy/.env                   # jedes change-me ersetzen: damit startet Kontext nicht
docker compose -f deploy/compose.yaml up -d
```

Danach Stalwart in seiner Verwaltung (Port 8080, nur über SSH-Tunnel oder Tailscale) so einrichten,
wie es die [Anleitung](https://firsttris.github.io/kontext/installation.html#3-stalwart-einrichten) aufzählt: Domain und DKIM, das Konto des Chefs
(alle anderen legt er später in Kontext an), Kontexts Container-Netz `10.89.250.0/24` als erlaubte
IP (sonst können falsche Passwörter Kontext selbst sperren lassen) und den API-Schlüssel für die
Firmenverwaltung (`STALWART_ADMIN_KEY`; ohne ihn gibt es keine Firmenverwaltung, keine weiteren
Postfächer und keine Antwort-Knöpfe in Einladungen, siehe
[Firmenverwaltung](https://firsttris.github.io/kontext/installation.html#firmenverwaltung-einschalten)). Dann unter `https://<deine Domain>`
anmelden. Für zehn Benutzer reicht ein VPS mit 2 vCPU und 4 GB RAM.

Anrufe (LiveKit) und Dokumente (Schreibzeug) sind Compose-Profile, die `.env.example` schon
einschaltet (`COMPOSE_PROFILES=calls,documents`): ihre Geheimnisse und DNS-Namen setzen oder sie
dort herausnehmen. Für Telefonie kommt eine kleine Box ins Büro. DNS-Einträge, Podman-Quadlets,
Backups und Updates stehen in der
[Installationsanleitung](https://firsttris.github.io/kontext/installation.html).

## ✨ Funktionen

| | |
|---|---|
| ✉️ **Mail** | **Gemeinsame Postfächer** (info@ mit Rechten pro Person, Antworten zeigen, wer geantwortet hat), alle Posteingänge in einer Liste, **Kategorien**, **Regeln auf dem Server**, Suche wie in Gmail, Wiedervorlage, Senden rückgängig und später senden, Textbausteine, **weitere Postfächer** (Gmail, GMX, WEB.DE), **Warnungen vor Phishing und gefälschten Absendern**, Signaturen, Abwesenheitsnotiz, immer aktuell per JMAP-Push · [mehr →](https://firsttris.github.io/kontext/mail.html) |
| 📅 **Kalender** | Tag, Woche, Monat und Liste, Serien, **Einladungen mit einem Klick beantworten**, ganz ohne Konto, **Wer hat Zeit?** wie der Terminplanungs-Assistent in Outlook, **Videobesprechung pro Termin**, Orte aus OpenStreetMap, geteilte Kalender · [mehr →](https://firsttris.github.io/kontext/calendar-contacts.html) |
| 👥 **Kontakte** | **Der Kunde auf einen Blick**: letzte Mails, nächste Termine, offene Aufgaben, Dokumente und Anrufe – ein kleines CRM; Fotos, Gruppen, vCard, weitere Kontakte wie bei Gmail, Doppelte zusammenführen · [mehr →](https://firsttris.github.io/kontext/calendar-contacts.html#kontakte) |
| ✅ **Aufgaben** | **Liste oder Kanban-Board** pro Postfach, wiederkehrende Aufgaben, **aus einer Mail, einer Chat-Nachricht, einer Regel oder einem verpassten Anruf**, Schnelleingabe („Rückruf Hoffmann morgen“), Erinnerungen als Push, CalDAV für Thunderbird und Handy · [mehr →](https://firsttris.github.io/kontext/tasks.html) |
| 💬 **Team-Chat & Video** | Kanäle und Direktnachrichten, @Erwähnungen, Threads, Reaktionen, **Mails, Aufgaben und Kontakte als Karten**, Sprachnachrichten, **Anrufe, Video und Bildschirm teilen** auf dem eigenen Server (LiveKit), **Ende-zu-Ende verschlüsselte Unterhaltungen** · [mehr →](https://firsttris.github.io/kontext/chat.html) |
| 📞 **Telefonie (CTI)** | **Fritzbox und Nummern bleiben**: Anrufe klingeln in Kontext mit Kontakt, letzter Mail und nächstem Termin des Anrufers, **Anrufen per Klick**, **Mailbox als Mail**, verpasste Anrufe werden Aufgaben, Öffnungszeiten und Sprachmenü, Weitervermitteln und Konferenz, Snom-Tischtelefone, Fax als PDF · [mehr →](https://firsttris.github.io/kontext/telephony.html) |
| 🔐 **Verschlüsselung** | **OpenPGP** im Browser, **S/MIME** für Behörden und Kanzleien, **vertraulich senden an jeden** über einen Link auf den eigenen Server, TLS mit MTA-STS und DANE, verschlüsselte Backups · [mehr →](https://firsttris.github.io/kontext/encryption.html) |
| 📄 **Dokumente** | **Word, Excel, PowerPoint und PDF** in Kontext mit [Schreibzeug](https://github.com/firsttris/schreibzeug), ein Ordner pro gemeinsamem Postfach, Anhänge in Dokumente und zurück · [mehr →](https://firsttris.github.io/kontext/documents.html) |
| 🤖 **KI-Agenten (MCP)** | **Kontext ist ein MCP-Server**: Claude und andere Agenten schlagen Kunden, Mails, Termine und Aufgaben mit deinen Rechten nach und schreiben Entwürfe – kein Senden, kein Löschen, jede Änderung protokolliert · [mehr →](https://firsttris.github.io/kontext/agents.html) |
| 🏢 **Firmenverwaltung** | **Mitarbeiter, gemeinsame Postfächer und Rechte** ohne IT-Kenntnisse, Abwesenheit mit Vertretung, Firmen-Signatur, **Austritt ohne Löschen**, Datensicherung im Blick, **Umzug von Microsoft 365, Gmail, IMAP und Outlook (PST)** · [mehr →](https://firsttris.github.io/kontext/company.html) |
| 📱 **Auf jedem Gerät** | **Eine App am PC, unter Android und am iPhone** (PWA, ohne App Store), Benachrichtigungen auch bei geschlossener App, eine Tab-Leiste mit deinen Apps, hell und dunkel, Anmeldung mit zweitem Faktor · [mehr →](https://firsttris.github.io/kontext/index.html) |

<img src="docs/screenshots/phone-call.png" alt="CTI in Kontext: ein Anruf über die Fritzbox klingelt im Browser mit Kontakt, Firma, Nummer und letzter Mail des Anrufers, neben dem Posteingang" width="900">

## 📸 Screenshots

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/shared-mailbox.png" alt="Gemeinsames Postfach info@ in Kontext: eine Kundenanfrage zur Wärmepumpe mit der Kategorie In Bearbeitung"><br><sub><b>Gemeinsames Postfach</b> – info@ fürs ganze Team · <a href="https://firsttris.github.io/kontext/mail.html">Doku →</a></sub></td>
    <td width="50%"><img src="docs/screenshots/compose.png" alt="Antwort schreiben in Kontext mit Formatierungsleiste, Zitat und Absenderwahl"><br><sub><b>Schreiben</b> – Formatierung, Zitat, Absender · <a href="https://firsttris.github.io/kontext/mail.html#schreiben">Doku →</a></sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/calendar.png" alt="Teamkalender in der Wochenansicht mit Baubesprechung, Wartungstermin und Monatsübersicht"><br><sub><b>Kalender</b> – Woche, Monat, Verfügbarkeit · <a href="https://firsttris.github.io/kontext/calendar-contacts.html">Doku →</a></sub></td>
    <td><img src="docs/screenshots/contacts.png" alt="Kontakt Markus Hoffmann mit nächsten Terminen und letzten Mails, wie ein kleines CRM"><br><sub><b>Kontakte</b> – der Kunde auf einen Blick · <a href="https://firsttris.github.io/kontext/calendar-contacts.html#kontakte">Doku →</a></sub></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/tasks-board.png" alt="Kanban-Board des gemeinsamen Postfachs info@ mit Offen, In Arbeit, Wartet und Erledigt"><br><sub><b>Aufgaben</b> – ein Kanban-Board pro Postfach · <a href="https://firsttris.github.io/kontext/tasks.html">Doku →</a></sub></td>
    <td><img src="docs/screenshots/chat.png" alt="Team-Chat-Kanal mit Baustellenbericht, einer geteilten Kundenmail als Karte und einer Aufgabe aus einer Nachricht"><br><sub><b>Team-Chat</b> – Mails als Karten, Aufgaben aus Nachrichten · <a href="https://firsttris.github.io/kontext/chat.html">Doku →</a></sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mail-dark.png" alt="Posteingang von Kontext im dunklen Design" width="720">
</p>

<p align="center">
  <img src="docs/screenshots/phone-mail.png" alt="Kontext am Handy: Posteingang mit Tab-Leiste" width="200">
  <img src="docs/screenshots/phone-read.png" alt="Eine Mail am Handy lesen" width="200">
  <img src="docs/screenshots/phone-calendar.png" alt="Kalender-Tagesansicht am Handy" width="200">
  <img src="docs/screenshots/phone-chat.png" alt="Team-Chat am Handy mit Sprechblasen, einer Datei und einer Mail-Karte" width="200">
</p>

## 🔀 Kontext und die Alternativen

Kontext ist für einen kleinen Betrieb gemacht, der den Komfort von Google Workspace auf dem
eigenen Server will, mit Mail, Kalender, Chat und Firmentelefon an einem Ort.

| | Was es ist | Was Kontext anders macht |
| --- | --- | --- |
| [Google Workspace](https://workspace.google.com) | Gmail, Kalender, Drive und Meet im Abo pro Benutzer | eigener Server, keine Kosten pro Kopf, Daten in Europa |
| [Microsoft 365](https://www.microsoft.com/microsoft-365) | Outlook, Teams und Office im Abo pro Benutzer | läuft im Browser ohne Outlook, Chat und Telefon inklusive, Daten auf dem eigenen Server |
| [Nextcloud](https://nextcloud.com) | selbst gehostete Dateien mit Mail, Kalender und Talk als Apps | um Mail und den Kunden herum gebaut: gemeinsame Postfächer, Regeln und Kategorien fürs Team, das Firmentelefon; Dateien über Schreibzeug |
| [Roundcube](https://roundcube.net), [SOGo](https://www.sogo.nu) | bewährte Webmailer und Groupware für IMAP | moderne Oberfläche fürs Handy, JMAP-Push, Kontakte mit Kundenansicht, Aufgaben und Chat |
| [Zimbra](https://www.zimbra.com), [Open-Xchange](https://www.open-xchange.com) | Groupware-Pakete für Provider und größere Firmen | ein kleiner Server pro Firma, an einem Nachmittag eingerichtet, eine Firmenverwaltung für den Chef |
| [3CX](https://www.3cx.com), [Placetel](https://www.placetel.de) | Telefonanlagen mit CTI-Apps | Fritzbox und Nummern bleiben, Anrufe stehen neben den Mails des Kunden, keine Lizenz pro Nebenstelle |
| Bulwark | JMAP-Webmail für Stalwart | Kalender, Kontakte, Aufgaben, Chat, Telefonie und Firmenverwaltung |

## ❓ FAQ

<details>
<summary><b>Gibt es eine Open-Source-Alternative zu Google Workspace und Microsoft 365?</b></summary>

Ja, Kontext: Mail mit gemeinsamen Postfächern, Kalender, Kontakte, Aufgaben, Team-Chat mit
Videoanrufen und die Telefonanlage in einer Web-App auf deinem eigenen Server, Dokumente über
[Schreibzeug](https://github.com/firsttris/schreibzeug). Siehe [Installation](https://firsttris.github.io/kontext/installation.html).
</details>

<details>
<summary><b>Was kostet das?</b></summary>

Die Software ist kostenlos (AGPL). Du brauchst einen Server – einen VPS ab etwa 5 € im Monat – und
jemanden, der ihn einrichtet und aktuell hält.
</details>

<details>
<summary><b>Gibt es eine Weboberfläche für den Mailserver Stalwart?</b></summary>

Ja, das ist Kontext: ein JMAP-Webclient für Mail, Kalender und Kontakte auf
[Stalwart](https://stalw.art), dazu Aufgaben, Chat, Telefonie und eine Firmenverwaltung, die
Stalwarts Konten und Gruppen pflegt. Siehe [Architektur](https://firsttris.github.io/kontext/architecture.html).
</details>

<details>
<summary><b>Funktioniert Kontext mit meiner Fritzbox (CTI)?</b></summary>

Ja. Eine Telefonbox im Büro meldet sich an der Fritzbox als IP-Telefon an; Anrufe klingeln dann in
Kontext mit Kontakt, letzter Mail und nächstem Termin des Anrufers, und du rufst aus jedem Kontakt
an. Siehe [Telefonie](https://firsttris.github.io/kontext/telephony.html).
</details>

<details>
<summary><b>Läuft das auf meinem eigenen PC oder NAS?</b></summary>

Ja, Kontext läuft überall, wo Docker oder Podman läuft. Um Mails aus dem Internet zu empfangen,
braucht der Rechner aber Port 25 von außen, eine feste IP-Adresse und einen Reverse-DNS-Eintrag;
private Internetanschlüsse sperren Port 25 meist. Zu Hause geht es am besten mit einem Mail-Relay
davor – ein kleiner VPS ist einfacher. Die Telefonbox läuft auf einem NAS, einem Raspberry Pi oder
einem Thin Client im Büro.
</details>

<details>
<summary><b>Ist das DSGVO-konform?</b></summary>

Es ist dafür gebaut: Die Daten bleiben auf deinem Server, ohne Tracker oder Dritte. Einen
Auftragsverarbeitungsvertrag schließt du mit deinem Hoster; bei einem Server im eigenen Haus
nicht einmal das. Für die GoBD wird beim Austritt nichts gelöscht, und Backups gehen verschlüsselt
auf S3-Speicher mit Object Lock.
</details>

<details>
<summary><b>Funktionieren iPhone, Android, Outlook und Thunderbird weiter?</b></summary>

Ja. Stalwart spricht IMAP, SMTP, CalDAV und CardDAV; jedes Mailprogramm und Handy kann sich direkt
verbinden. Kontext ist die Oberfläche im Browser obendrauf, und die Aufgaben sind auch
CalDAV-Aufgabenlisten.
</details>

<details>
<summary><b>Kann ich von Gmail, Microsoft 365 oder Outlook umziehen?</b></summary>

Ja, unter *Einstellungen → Firma → Umzug*: IMAP-Postfächer (abgeglichen, bis der Umzug
abgeschlossen ist), Microsoft 365 über eine App im Microsoft-Konto der Firma, Outlook als PST-Datei,
Kontakte und Kalender aus dem Google-Export. Siehe [Firmenverwaltung und Umzug](https://firsttris.github.io/kontext/company.html).
</details>

<details>
<summary><b>Kann ich meine Gmail-Adresse weiter nutzen?</b></summary>

Ja, unter *Einstellungen → Weitere Postfächer*: Neue Mails kommen in Kontext an, und du sendest als
diese Adresse über den Server des Anbieters, damit Empfänger sie als echt sehen.
</details>

<details>
<summary><b>Kann ich Claude oder andere KI-Agenten mit meinen Mails nutzen?</b></summary>

Ja, Kontext ist ein MCP-Server. Ein Agent arbeitet mit deinen Rechten, legt Entwürfe an statt zu
senden und löscht nie etwas. Siehe [KI-Agenten](https://firsttris.github.io/kontext/agents.html).
</details>

<details>
<summary><b>Welche Sprachen?</b></summary>

Die App ist vorerst auf Deutsch; Englisch und weitere europäische Sprachen sind geplant.
</details>

## 📚 Dokumentation

Die ganze Dokumentation, mit Suche, steht unter **[firsttris.github.io/kontext](https://firsttris.github.io/kontext/)**:
jede Funktion im Detail, [Installation](https://firsttris.github.io/kontext/installation.html),
[Architektur](https://firsttris.github.io/kontext/architecture.html) und
[Entwicklung](https://firsttris.github.io/kontext/development.html). Was als Nächstes kommt, steht
in der [Roadmap](ROADMAP.md).

## 🛠️ Entwicklung

Benötigt [Bun](https://bun.sh) 1.4 und Linux oder macOS.

```bash
git clone https://github.com/firsttris/kontext && cd kontext
bun install
bun run dev   # Stalwart mit Testdaten, Server und App: http://localhost:5173
```

Anmelden als `jonas@weber-haustechnik.test` / `kaffee-werkbank-kontext` (der Chef, sieht auch die
Firmenverwaltung); `anna@`, `sandra@` und `max@` haben dasselbe Passwort, info@ und rechnung@ sind
gemeinsame Postfächer. `bun run dev:stalwart -- --fresh --seed` setzt die Testdaten zurück.

React, TanStack Router/Query, Tailwind und Tiptap im Browser; ein kleiner Bun-Server mit Hono,
Better Auth und SQLite (Drizzle) für Anmeldung, JMAP zu Stalwart, Chat und Aufgaben; LiveKit für
Anrufe, Asterisk in der Telefonbox. Tests, CI und Releases: [Entwicklung](https://firsttris.github.io/kontext/development.html).

## 🤝 Mitmachen

Issues und Pull Requests sind willkommen. Ein guter Fehlerbericht nennt Browser oder Handy, die
Ansicht, was passiert ist und die Version von Kontext (ein Screenshot hilft); das
[Formular für Fehlerberichte](https://github.com/firsttris/kontext/issues/new?template=bug_report.yml)
fragt all das ab. Sicherheitslücken bitte vertraulich melden, siehe [SECURITY.md](SECURITY.md). Vor
einem Pull Request bitte die Prüfungen aus [CONTRIBUTING.md](CONTRIBUTING.md) laufen lassen:

```bash
bun run typecheck && bun run lint && bun run test && bun run build   # oder: bun run check
bun run e2e                                                          # Playwright gegen einen eigenen Stalwart
mkdocs build --strict                                                # wenn sich docs/ geändert hat
```

---

<div align="center">

⭐ Gefällt dir Kontext? Ein [Stern auf GitHub](https://github.com/firsttris/kontext) hilft anderen, es zu finden.<br>
🐛 [Fehler melden](https://github.com/firsttris/kontext/issues/new?template=bug_report.yml) · 💡 [Idee vorschlagen](https://github.com/firsttris/kontext/issues/new?template=feature_request.yml)

<sub>Lizenz: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel und Mitwirkende · <a href="README.md">English version</a><br>
Wer eine veränderte Version weitergibt oder für andere betreibt, muss ihren Quellcode unter der AGPL anbieten; eine kommerzielle Lizenz ohne diese Pflichten gibt es über <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Kontext steht in keiner Verbindung zu Stalwart Labs, AVM (FRITZ!Box), Snom, Google, Microsoft oder Anthropic.</sub>

</div>
