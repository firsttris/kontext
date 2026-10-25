<div align="center">

<h1>Kontext: Mail, Kalender und Team-Chat für kleine Firmen, selbst gehostet</h1>

**Die Open-Source-Alternative zu Google Workspace und Microsoft 365, die auf deinem eigenen Server läuft.**<br>
Mail mit gemeinsamen Postfächern, Kalender, Kontakte, Aufgaben und Team-Chat in einer Web-App für PC und Handy, zu jedem Kunden die Mails und Termine auf einen Blick.<br>
Keine Kosten pro Benutzer, keine US-Cloud: DSGVO-freundlich, auf dem Mailserver Stalwart, installiert mit Docker Compose.

[English](README.md) · **Deutsch**

[![CI](https://github.com/firsttris/kontext/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/kontext/actions/workflows/ci.yml)
[![Doku](https://img.shields.io/badge/Doku-firsttris.github.io%2Fkontext-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/kontext/)
[![Lizenz: AGPL-3.0](https://img.shields.io/badge/Lizenz-AGPL--3.0-blue)](LICENSE)
[![Stalwart 0.16](https://img.shields.io/badge/Stalwart-0.16-18181b)](https://stalw.art)
[![JMAP](https://img.shields.io/badge/JMAP-IMAP%20%7C%20CalDAV%20%7C%20CardDAV-0f766e)](https://firsttris.github.io/kontext/architecture.html)
[![MCP](https://img.shields.io/badge/KI--Agenten-MCP-d97757)](#-ki-agenten-mcp)

```bash
docker compose -f deploy/compose.yaml up -d
```

[Installation](#-installation) •
[Funktionen](#-funktionen) •
[Screenshots](#-screenshots) •
[Alternativen](#-kontext-und-die-alternativen) •
[FAQ](#-faq) •
[Dokumentation](https://firsttris.github.io/kontext/)

<img src="docs/screenshots/mail.png" alt="Kontext, selbst gehostetes Webmail: Posteingang mit Ordnern, den gemeinsamen Postfächern info@ und rechnung@, Kategorien und einer geöffneten Mail mit Vorschau des PDF-Anhangs" width="900">

</div>

## 💡 Warum Kontext?

Google Workspace und Microsoft 365 sind bequem, aber jeder Benutzer kostet jeden Monat, und deine
Mails liegen bei einem US-Konzern. Kontext fühlt sich im Browser und am Handy genauso vertraut an,
läuft aber auf **deinem** Server: einem kleinen VPS ab etwa 5 € im Monat (Hetzner, IONOS, …) oder
einem eigenen Rechner.

**🇪🇺 Made in Europe**

- **Deine Daten bleiben bei dir**: Mails, Termine und Kontakte liegen auf deinem Server, auf Wunsch in einem deutschen Rechenzentrum. Keine Tracker, keine Werbung.
- **Keine Kosten pro Kopf**: zehn Mitarbeiter kosten dasselbe wie einer; du bezahlst nur den Server.
- **Alles zu einem Kunden an einem Ort**: ein Kontakt zeigt seine letzten Mails, nächsten Termine und offenen Aufgaben. Ein kleines CRM ohne Extra-Tool.
- **Fürs Team gemacht**: gemeinsame Postfächer wie info@ und rechnung@, ein Teamkalender, Aufgaben auf dem Kanban-Board und ein Team-Chat mit Anrufen.
- **Passt zu dem, was du hast**: offene Standards (JMAP, IMAP, CalDAV, CardDAV), Outlook, Thunderbird, iPhone und Android funktionieren weiter. Der Umzug von Gmail, Microsoft 365 und Outlook ist eingebaut.
- **GoBD-gerechte Aufbewahrung**: beim Austritt wird nichts gelöscht, Backups gehen verschlüsselt und unveränderbar auf S3 mit Object Lock.

Kontext ist für Freelancer, Handwerk, Kanzleien, Praxen und den Mittelstand gemacht, und für alle,
die selbst hosten.

## 🚀 Installation

Du brauchst einen Linux-Server mit Docker, eine eigene Domain und offene Ports 25, 80, 443, 465, 587 und 993:

```bash
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env      # Domain, Mailserver-Name, Backup-Ziel eintragen
docker compose -f deploy/compose.yaml up -d
```

Danach in Stalwarts Verwaltung Domain, DKIM und Benutzer anlegen und unter `https://<deine Domain>`
anmelden. Für zehn Benutzer reicht ein VPS mit 2 vCPU und 4 GB RAM. DNS-Einträge (MX, SPF, DKIM,
DMARC), Backups und Updates stehen in der
[Installationsanleitung](https://firsttris.github.io/kontext/installation.html).

## ✨ Funktionen

Alle Funktionen im Detail: [Funktionen](https://firsttris.github.io/kontext/features.html).

### ✉️ Mail

- **Gemeinsame Postfächer**: info@ & Co. bei jedem Mitglied in der Seitenleiste, Antworten gehen als info@ raus, mit dem Namen der Person, die geantwortet hat.
- **Suche wie in Gmail** über alle Ordner und Postfächer, mit `from:`, `has:attachment`, `in:info@` und mehr.
- **Regeln, Kategorien und Wiedervorlage**, die auf dem Server laufen, auch wenn Kontext geschlossen ist; in gemeinsamen Postfächern sieht sie das ganze Team.
- **Senden rückgängig, später senden, Textbausteine**, Formatierung und Anhänge mit Vorschau.
- **Verschlüsselung**: OpenPGP im Browser, oder vertraulich an alle senden, über einen Link auf deinem eigenen Server.
- **Schutz vor Phishing**: eine Warnung, wenn ein Absender gefälscht ist (SPF, DKIM, DMARC).
- **Gmail- oder GMX-Adresse behalten**: ihre Mails abrufen und als sie senden.

### 📅 Kalender, Kontakte und Aufgaben

- **Kalender** mit Tag, Woche, Monat und Liste, Einladungen, geteilten Kalendern und einem Videolink pro Termin.
- **Wer hat Zeit?** Freie und belegte Zeiten der Kollegen und der nächste Termin, der allen passt.
- **Kontakte** mit Kunden-Ansicht, Gruppen, geteilten Adressbüchern und vCard-Import.
- **Aufgaben und Kanban-Boards** für dich und pro gemeinsamem Postfach; aus einer Mail wird mit einer Taste eine Aufgabe.

### 💬 Team-Chat, Telefon und Dokumente

- **Kanäle und Direktnachrichten**, Threads, Reaktionen, @-Erwähnungen, Fotos und Dateien.
- **Eine Mail besprechen** im Kanal, statt sie intern weiterzuleiten.
- **Anrufe und Videobesprechungen** im Browser, auf deinem eigenen Server ([LiveKit](https://github.com/livekit/livekit)).
- **Telefonieren über die Fritzbox**: Anrufe klingeln in Kontext, mit der letzten Mail und dem nächsten Termin des Anrufers; Anrufbeantworter, Öffnungszeiten und Anrufstatistik.
- **Word, Excel und PDF** in Kontext mit [Schreibzeug](https://github.com/firsttris/schreibzeug).

### 🤖 KI-Agenten (MCP)

- **Claude und andere Agenten arbeiten mit deinen Mails**: Kontext als Connector eintragen und im Browser anmelden (OAuth), oder einem Agenten einen Zugangsschlüssel geben.
- **Nach einem Kunden fragen**: der Agent schlägt letzte Mails, Termine, Kontakte und Aufgaben über alle deine Postfächer nach, mit deinen Rechten.
- **Sicher gebaut**: wenn du es erlaubst, schreibt er Entwürfe und legt Termine, Kontakte und Aufgaben an. Er sendet und löscht nie; jede Änderung wird protokolliert, jede Verbindung lässt sich trennen.

### 🏢 Für den Chef

- **Firmenverwaltung ohne IT-Kenntnisse**: Mitarbeiter anlegen, Passwörter zurücksetzen, Zugang sperren, gemeinsame Postfächer mit Rechten pro Person.
- **Abwesenheit mit Vertretung** und eine Firmen-Signatur für alle.
- **Austritt ohne Datenverlust**: Postfach übergeben und weiterleiten; gelöscht wird nichts.
- **Umzug** von Microsoft 365, Gmail, GMX & Co. (läuft parallel weiter, bis du abschließt), aus Outlook (PST) und dem Google-Export.

### 📱 Auf jedem Gerät

- **Fürs Handy gebaut**: jede Ansicht funktioniert auf dem kleinen Bildschirm, mit Tab-Leiste.
- **Als App installierbar** auf PC, Android und iPhone, ohne App-Store; Benachrichtigungen für neue Mails, Nachrichten und Anrufe, auch wenn Kontext geschlossen ist.
- **Hell und dunkel**, Tastenkürzel wie in Gmail.

## 📸 Screenshots

<table>
  <tr>
    <td><img src="docs/screenshots/shared-mailbox.png" alt="Gemeinsames Postfach info@ in Kontext: Kundenanfrage zu einer Wärmepumpe mit der Kategorie In Bearbeitung"></td>
    <td><img src="docs/screenshots/calendar.png" alt="Teamkalender in der Wochenansicht mit Baustellentermin, Wartungstermin und Monatsübersicht"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/contacts.png" alt="Kontakt Markus Hoffmann mit nächsten Terminen und letzten Mails, ein kleines CRM"></td>
    <td><img src="docs/screenshots/tasks-board.png" alt="Kanban-Board des gemeinsamen Postfachs info@ mit Offen, In Bearbeitung, Wartet und Erledigt"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/chat.png" alt="Team-Chat-Kanal mit Baustellenbericht, einer Kundenmail als Karte und einer Aufgabe aus einer Nachricht"></td>
    <td><img src="docs/screenshots/mail-dark.png" alt="Posteingang von Kontext im dunklen Design"></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/phone-mail.png" alt="Posteingang am Handy mit Tab-Leiste" width="200">
  <img src="docs/screenshots/phone-read.png" alt="Eine Mail lesen am Handy" width="200">
  <img src="docs/screenshots/phone-calendar.png" alt="Kalender-Tagesansicht am Handy" width="200">
  <img src="docs/screenshots/phone-chat.png" alt="Team-Chat am Handy mit Sprechblasen, einer Datei und einer Mail-Karte" width="200">
</p>

## 🔀 Kontext und die Alternativen

Kontext ist für kleine Firmen gemacht, die einen eigenen Server wollen, ohne auf den Komfort von
Gmail und Outlook zu verzichten.

| | Was es ist | Was Kontext anders macht |
|---|---|---|
| [Google Workspace](https://workspace.google.com) | Gmail, Kalender und Drive als Abo pro Benutzer | eigener Server, keine Kosten pro Kopf, Daten in Europa |
| [Microsoft 365](https://www.microsoft.com/microsoft-365) | Outlook und Office als Abo pro Benutzer | läuft im Browser ohne Outlook, Daten auf dem eigenen Server |
| [Nextcloud](https://nextcloud.com) | Dateiablage mit Mail, Kalender und Talk als Apps | Mail zuerst: gemeinsame Postfächer, Regeln und die Kunden-Ansicht im Mittelpunkt |
| [Roundcube](https://roundcube.net), [SOGo](https://www.sogo.nu) | bewährtes Webmail und Groupware | moderne Oberfläche, fürs Handy gebaut, Aufgaben und Chat inklusive |
| Bulwark | JMAP-Webmail für Stalwart | Kalender, Kontakte, Aufgaben, Chat, Firmenverwaltung und Team-Regeln |

## ❓ FAQ

### Was kostet Kontext?

Die Software ist kostenlos und Open Source (AGPL). Es braucht einen Server, ein VPS ab etwa 5 € im
Monat, und jemanden, der ihn einrichtet und aktualisiert.

### Ist Kontext eine selbst gehostete Alternative zu Google Workspace oder Microsoft 365?

Ja. Mail, Kalender, Kontakte, Aufgaben, Chat und Dokumente laufen auf deinem eigenen Server, im
Browser und am Handy, ohne Gebühr pro Benutzer.

### Ist das DSGVO-konform?

Kontext ist dafür gebaut: die Daten bleiben auf deinem Server, ohne Tracker und ohne
Drittanbieter. Einen Auftragsverarbeitungsvertrag brauchst du nur mit deinem Hoster; bei einem
Server im eigenen Haus entfällt auch das.

### Und die GoBD?

Kontext löscht beim Austritt nichts und sichert unveränderbar (S3 mit Object Lock). Zur GoBD
gehören auch die Abläufe im Betrieb und eine Verfahrensdokumentation; die Software ist ein
Baustein, kein Zertifikat.

### Funktionieren Outlook, Thunderbird, iPhone und Android weiter?

Ja. Stalwart spricht IMAP, SMTP, CalDAV und CardDAV, jedes Mailprogramm und jedes Handy verbindet
sich direkt. Kontext ist die Oberfläche im Browser dazu.

### Kann ich von Gmail, Microsoft 365 oder Outlook umziehen?

Ja, unter *Einstellungen → Firma → Umzug*: IMAP-Postfächer (laufen parallel weiter, bis der Umzug
abgeschlossen ist), Microsoft 365, Outlook-PST-Dateien und der Google-Export mit Kontakten und
Kalendern.

### Können Claude oder ChatGPT meine Mails in Kontext lesen?

Nur wenn du einen Agenten verbindest. Kontext ist ein MCP-Server: ein Agent sieht, was du sehen
darfst, schreibt höchstens Entwürfe und sendet nie. Jede Verbindung lässt sich in den
Einstellungen trennen.

### Geht es auch auf meinem eigenen PC?

Ja, überall, wo Docker läuft. Für Mail aus dem Internet braucht der Rechner aber Port 25 von außen,
eine feste IP-Adresse und einen Reverse-DNS-Eintrag; private Anschlüsse sperren Port 25 meist,
einfacher ist ein kleiner VPS.

### In welcher Sprache ist die App?

Derzeit Deutsch; Englisch und weitere europäische Sprachen sind geplant.

## 📚 Dokumentation

Die ganze Dokumentation steht unter **[firsttris.github.io/kontext](https://firsttris.github.io/kontext/)**.

| | |
|---|---|
| [Funktionen](https://firsttris.github.io/kontext/features.html) | alles, was Kontext kann, nach Bereichen |
| [Installation](https://firsttris.github.io/kontext/installation.html) | Server, DNS (MX, SPF, DKIM, DMARC), erster Start, Backups, Updates |
| [Architektur](https://firsttris.github.io/kontext/architecture.html) | wie App, Server, Caddy und Stalwart zusammenspielen |
| [Verschlüsselung](https://firsttris.github.io/kontext/encryption.html) | OpenPGP, S/MIME und vertraulich senden |
| [Entwicklung](https://firsttris.github.io/kontext/development.html) | lokaler Stalwart mit Testdaten, Tests, CI, Releases |

## 🛠️ Entwicklung

Benötigt [Bun](https://bun.sh) 1.4 und Linux oder macOS.

```bash
git clone https://github.com/firsttris/kontext && cd kontext
bun install
bun run dev   # Stalwart mit Testdaten, Server und App: http://localhost:5173
```

Anmelden mit `jonas@weber-haustechnik.test` / `kaffee-werkbank-kontext` (Chef, sieht auch die
Firmenverwaltung); `anna@`, `sandra@` und `max@` haben dasselbe Passwort. Für den Umzug aus Outlook
braucht es lokal `readpst` (`sudo apt install pst-utils`).

React, TanStack Router und Query, Tailwind und Tiptap im Browser; ein kleiner Bun-Server mit Hono
und Better Auth für Anmeldung und JMAP zu Stalwart. Architektur, Tests und Releases:
[Entwicklung](https://firsttris.github.io/kontext/development.html). Was als Nächstes kommt, steht
in der [Roadmap](ROADMAP.md).

## 🤝 Mitmachen

Issues und Pull Requests sind willkommen. Ein guter Fehlerbericht nennt Browser oder Handy, die
Ansicht und was zu sehen war (ein Screenshot hilft). Vor einem Pull Request bitte
`bun run typecheck && bun run lint && bun run test && bun run e2e` laufen lassen.

---

<div align="center">

⭐ Gefällt dir Kontext? Ein [Stern auf GitHub](https://github.com/firsttris/kontext) hilft anderen, es zu finden.<br>
🐛 [Fehler melden](https://github.com/firsttris/kontext/issues/new) · 💡 [Idee vorschlagen](https://github.com/firsttris/kontext/issues/new)

<sub>Lizenz: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel und Mitwirkende · <a href="README.md">English version</a><br>
Wer eine veränderte Version weitergibt oder für andere betreibt, muss ihren Quellcode unter der AGPL anbieten; eine kommerzielle Lizenz ohne diese Pflichten gibt es über <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Kontext steht in keiner Verbindung zu Stalwart Labs, Google, Microsoft, Anthropic oder AVM.</sub>

</div>
