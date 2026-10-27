<div align="center">

<h1>Kontext: die selbst gehostete Alternative zu Google Workspace und Microsoft 365</h1>

**Mail, Kalender, Kontakte, Aufgaben, Team-Chat und Telefonie (CTI) für kleine Betriebe – auf deinem eigenen Server.**<br>
Gemeinsame Postfächer, ein Kalender fürs Team und Kontakte, die alles verbinden: zu jedem Kunden Mails, Termine, Aufgaben und Anrufe auf einen Blick.<br>
Open Source (AGPL), eine Web-App und PWA auf dem Mailserver Stalwart, keine Kosten pro Benutzer. Made in Europe.

[English](README.md) · **Deutsch**

[![CI](https://github.com/firsttris/kontext/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/kontext/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-firsttris.github.io%2Fkontext-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/kontext/)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Stalwart 0.16](https://img.shields.io/badge/Stalwart-0.16-18181b)](https://stalw.art)
[![JMAP](https://img.shields.io/badge/JMAP-mail%20%7C%20calendar%20%7C%20contacts-0f766e)](https://jmap.io)
[![Docker](https://img.shields.io/badge/Docker-Compose%20%7C%20Podman-2496ed?logo=docker&logoColor=white)](https://firsttris.github.io/kontext/installation.html)

```bash
docker compose -f deploy/compose.yaml up -d
```

[Warum](#-warum-kontext) •
[Datenschutz & GoBD](#-deine-daten-deine-regeln) •
[Installation](#-installation) •
[Funktionen](#-funktionen) •
[Telefonie (CTI)](#-telefonie-cti-mit-der-fritzbox) •
[Screenshots](#-screenshots) •
[Alternativen](#-kontext-und-die-alternativen) •
[FAQ](#-faq) •
[Dokumentation](https://firsttris.github.io/kontext/)

<img src="docs/screenshots/mail.png" alt="Kontext, Webmail auf dem eigenen Server: Posteingang mit Ordnern, gemeinsamen Postfächern info@ und rechnung@, Kategorien und einer geöffneten Mail mit Vorschau des PDF-Anhangs" width="900">

</div>

## 💡 Warum Kontext?

Google Workspace und Microsoft 365 sind bequem – aber jeder Benutzer kostet jeden Monat, und die
Daten liegen bei einem US-Konzern. Kontext bietet dasselbe Gefühl im Browser und am Handy, läuft
aber auf **deinem** Server: einem kleinen VPS ab etwa 5 € im Monat (z. B. bei IONOS oder Hetzner)
oder einem eigenen Rechner.

- **Alles gehört dir**: Mails, Termine, Kontakte, Chat und Anrufe liegen auf deinem Server, nicht bei einem Anbieter.
- **Keine Kosten pro Kopf**: zehn Mitarbeiter kosten dasselbe wie einer; bezahlt wird der Server.
- **Kontext statt Inseln**: zu jedem Kontakt die letzten Mails, nächsten Termine, offenen Aufgaben und Anrufe – ein kleines CRM ohne Extra-Tool.
- **Eine App statt fünf**: Mail, Kalender, Aufgaben, Team-Chat mit Videocalls, das Firmentelefon und Dokumente, mit einer Anmeldung.
- **Am Handy wie am PC**: jede Ansicht ist fürs Handy gebaut; als App auf jedem Gerät installierbar – ohne App-Store.
- **Offen**: Open Source (AGPL), Standardprotokolle (JMAP, IMAP, SMTP, CalDAV, CardDAV) – Outlook, Thunderbird, iPhone und Android funktionieren weiter.

**Für wen:** Freelancer und Selbstständige, Handwerk, Kanzleien, Praxen und den Mittelstand (mit
einer Firmenverwaltung, die der Chef ohne IT-Kenntnisse bedient) – und für Selfhoster, die eine
moderne Weboberfläche für [Stalwart](https://stalw.art) suchen.

## 🔒 Deine Daten, deine Regeln

- **DSGVO**: die Daten liegen auf deinem Server, auf Wunsch in einem deutschen Rechenzentrum. Keine Tracker, keine Werbung, keine Weitergabe; einen Auftragsverarbeitungsvertrag brauchst du nur mit deinem Hoster.
- **GoBD**: Kontext unterstützt die GoBD-gerechte Aufbewahrung – beim Austritt eines Mitarbeiters wird nichts gelöscht, Backups gehen verschlüsselt auf einen S3-Speicher mit Object Lock und sind damit unveränderbar. (GoBD-Konformität entsteht im Zusammenspiel mit den Abläufen im Betrieb und einer Verfahrensdokumentation; die Software ist ein Baustein davon.)
- **Kein Lock-in**: Mails, Kontakte und Kalender lassen sich jederzeit per IMAP, vCard und iCalendar mitnehmen; der Umzug *zu* Kontext ist eingebaut.
- **Sicher**: Anmeldung mit zweitem Faktor, Mails in einem abgeschotteten Rahmen, Warnungen vor gefälschten Absendern, OpenPGP und S/MIME.

## 🚀 Installation

Auf einem Server mit Docker (oder Podman), eigener Domain und offenen Ports 25, 80, 443, 465, 587 und 993:

```bash
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env      # Domain, Mailserver-Name, Geheimnisse, Backup-Ziel
chmod 600 deploy/.env                   # jedes change-me ersetzen: damit startet Kontext nicht
docker compose -f deploy/compose.yaml up -d
```

Danach in Stalwarts Verwaltung (Port 8080, nur über SSH-Tunnel oder Tailscale) Domain, DKIM und Benutzer anlegen,
Kontexts Container-Netz `10.89.250.0/24` als erlaubte IP eintragen (sonst können falsche
Passwörter Kontext selbst sperren lassen) und unter `https://<deine Domain>` anmelden. Für zehn Benutzer reicht ein VPS mit 2 vCPU und 4 GB
RAM. Anrufe (LiveKit), Telefonie und Dokumente sind Compose-Profile, die du bei Bedarf
einschaltest. DNS-Einträge, Podman-Quadlets, Backups und Updates stehen in der
[Installationsanleitung](https://firsttris.github.io/kontext/installation.html).

## ✨ Funktionen

### ✉️ Mail

- **Gemeinsame Postfächer**: info@ und Co. stehen bei jedem Mitglied in der Seitenleiste; Antworten gehen als info@ hinaus, mit dem Namen der Person, die geantwortet hat, und die Liste zeigt, wer schon geantwortet hat („Jonas · 14:02“). Rechte pro Person: kein Zugriff, nur lesen, lesen und senden.
- **Alle Posteingänge in einer Liste**, **Ordner und Unterordner**, Verschieben per Ziehen, auch zwischen info@ und den eigenen Ordnern.
- **Kategorien**: farbige Markierungen wie „In Bearbeitung“, „Wartet auf Antwort“, „Erledigt“ – mehrere pro Mail, per Regel gesetzt, im gemeinsamen Postfach fürs ganze Team: eine kleine Aufgabentafel.
- **Regeln auf dem Server** („wenn Absender, Empfänger, Betreff oder Text … dann verschieben, markieren, Kategorie setzen, weiterleiten, Aufgabe anlegen“) – sie wirken beim Eingang, auch wenn Kontext zu ist.
- **Suche wie in Gmail** über Ordner und Postfächer: `von:`, `an:`, `betreff:`, `hat:anhang`, `kategorie:`, `in:info@`, `nach:`/`vor:`.
- **Wiedervorlage**, **Senden rückgängig** und **später senden** – der Server verschickt sie, auch wenn der Rechner aus ist. **Textbausteine** für Standardantworten, eigene und gemeinsame.
- **Weitere Postfächer**: Gmail, GMX, WEB.DE & Co. behalten – neue Mails kommen alle zwei Minuten herein, gesendet wird als diese Adresse über deren Server.
- **Schutz vor Phishing und gefälschten Mails**: ein Hinweis, wenn der Absender nicht bestätigt ist, sich jemand von außen als deine Firma ausgibt oder Antworten an eine andere Adresse gehen; SPF, DKIM, DMARC und Spam-Bewertung in den Details; als Spam markieren, und der Filter lernt.
- **Bilder aus dem Internet** nur auf Wunsch (oder sofort bei Absendern, denen du vertraust), **Newsletter abbestellen** mit einem Klick, **Lesebestätigungen**, die nie von selbst hinausgehen.
- **Signatur pro Absenderadresse**, **Abwesenheitsnotiz** mit Zeitraum, **Wer schreibt?** neben der Mail auf breiten Bildschirmen (Firma, Termine, letzte Mails).
- **Unterhaltungen ohne Durcheinander**, **Anhänge mit Vorschau** (Fotos, erste PDF-Seite), **Schreiben mit Formatierung**, **Drucken** auf A4, **Tastaturkürzel** wie in Gmail, **immer aktuell** per JMAP-Push.

### 📅 Kalender und 👥 Kontakte

- **Tag, Woche, Monat und Liste**, Termine per Ziehen verschieben, Serien mit Ausnahmen, **Einladungen** mit Zusage und Absage.
- **Wer hat Zeit?** Beim Einladen von Kollegen zeigt Kontext, wer belegt ist, und schlägt Zeiten vor, in denen alle frei sind – wie der Terminplanungs-Assistent in Outlook.
- **Videobesprechung pro Termin**: ein Klick legt einen Link an; Kunden kommen im Browser ohne Konto dazu.
- **Kalender und Adressbücher teilen** mit Kollegen – nur Verfügbarkeit, lesen oder bearbeiten.
- **Der Kunde auf einen Blick**: letzte Mails, nächste Termine, offene Aufgaben, Dokumente und „Anrufen“; **Gruppen**, **vCard-Import und -Export**.

### ✅ Aufgaben

- **Liste oder Kanban-Board** für das eigene Postfach und eins pro gemeinsamem Postfach, mit eigenen Spalten und **wiederkehrenden Aufgaben**.
- **Aus einer Mail** (`t`), einer Chat-Nachricht, einer Mail-Regel oder einem verpassten Anruf; **Schnelleingabe** wie „Rückruf Hoffmann morgen“.
- **Überall**: am Kontakt, im Kalender, in der Glocke; Erinnerungen als Benachrichtigung, auch wenn Kontext zu ist.
- **In Thunderbird und am Handy**: die Boards als CalDAV-Aufgabenlisten (DAVx⁵ mit tasks.org, Apple Erinnerungen), in beide Richtungen.

### 💬 Team-Chat und Videocalls

- **Kanäle** (#allgemein, einer pro gemeinsamem Postfach, eigene) und **Direktnachrichten**, live mit „schreibt …“, wer online ist, **@Erwähnungen**, **Threads** und **Reaktionen**.
- **Mails, Aufgaben, Kontakte und Dokumente als Karten**: „Besprechen“ an einer Mail (`b`) bespricht sie im Kanal, statt sie intern weiterzuleiten – kopiert wird nichts.
- **Fotos und Dateien**, **Sprachnachrichten** wie bei WhatsApp (aufnehmen, direkt in der Unterhaltung abspielen, schneller mit 1,5× oder 2×), **Suche**, **Aufbewahrungsfrist** aus der Firmenverwaltung.
- **Anrufe, Videocalls und Bildschirm teilen** direkt aus einer Unterhaltung, auf dem eigenen Server mit [LiveKit](https://github.com/livekit/livekit); das Gespräch bleibt offen, während du zur Mail wechselst.
- **Vertrauliche Unterhaltungen**, Ende-zu-Ende verschlüsselt – Nachrichten, Dateien und Anrufe.

### 📞 Telefonie (CTI) mit der Fritzbox

Telefonie mit Computer-Anbindung fürs Firmentelefon: Eine kleine **Telefonbox** (Asterisk im
Container, auf einem Thin Client, einem Raspberry Pi oder einem NAS) meldet sich an der Fritzbox
als IP-Telefon an. Nummern und Tischtelefone bleiben, wie sie sind; im Büro wird nichts zum
Internet geöffnet.

<img src="docs/screenshots/phone-call.png" alt="CTI in Kontext: ein Anruf über die Fritzbox klingelt im Browser mit Kontakt, Firma, Nummer und letzter Mail des Anrufers, neben dem Posteingang" width="900">

- **Anrufe klingeln in Kontext** mit allem zum Anrufer – Kontakt, Firma, letzte Mail, nächster Termin – bei allen gewählten Personen am Rechner und am Handy; annehmen im Browser (Softphone) oder am Tischtelefon.
- **Anrufen per Klick** aus jedem Kontakt und jeder Mail; ein Tastenfeld für Sprachmenüs; eine **Anrufliste** mit Notizen und „Zurückrufen“.
- **Verpasste Anrufe werden Aufgaben**, die sich selbst abhaken, sobald jemand mit der Nummer gesprochen hat.
- **Mailbox als Mail**: die Ansage im Browser einsprechen; Nachrichten kommen als Mail mit der Aufnahme.
- **Öffnungszeiten** mit geschlossenen Tagen und Feiertagen, ein **Sprachmenü** („Für den Kundendienst drücken Sie die 1 …“), eine **Sperrliste**.
- **Weitervermitteln, Halten, Rückfrage und Dreierkonferenz**; alle gleichzeitig oder der Reihe nach klingeln lassen, dazu nach einer Weile ein Handy; **Durchwahlen** pro Team.
- **Snom-Tischtelefone**, die sich an der Box selbst einrichten, **Präsenz** und *Bitte nicht stören*, die **Türsprechstelle**, **Fax als PDF-Mail**, **Gespräche aufnehmen** mit Hinweis, **Anrufstatistik**.

Mehr in der [Doku zur Telefonie](https://firsttris.github.io/kontext/telephony.html) (im Test).

### 🔐 Verschlüsselung

- **OpenPGP im Browser**: eigener Schlüssel, gesperrt aufbewahrt; Mails lesen, unterschreiben und verschlüsseln, Schlüssel anderer aus Autocrypt, WKD und keys.openpgp.org.
- **S/MIME** für Behörden und Kanzleien: eigenes Zertifikat importieren, Unterschriften mit Kette und OCSP prüfen, Zertifikate im DNS finden.
- **Vertraulich senden an jeden**: Empfänger mit Schlüssel bekommen PGP oder S/MIME, alle anderen einen Link auf deinen Server und einen Code, den du telefonisch weitergibst.
- **Grundschutz für alles**: TLS auf dem Weg (MTA-STS und DANE prüft die Firmenverwaltung), verschlüsselte Platte und Backups.

Das [Verschlüsselungskonzept](https://firsttris.github.io/kontext/encryption.html) erklärt, was wovor geschützt ist.

### 📄 Dokumente

- **Word, Excel, PowerPoint und PDF** in Kontexts Fenster mit [Schreibzeug](https://github.com/firsttris/schreibzeug) (optional): keine zweite Anmeldung, ein Ordner pro gemeinsamem Postfach.
- **Anhänge in Dokumente ablegen**, **aus Dokumente anhängen**, Dateien an Aufgaben, Kontakten, Terminen und Chat-Nachrichten.

### 🤖 KI-Agenten (MCP)

- **Kontext ist ein MCP-Server**: in Claude als Connector eintragen (OAuth) oder einem Agenten einen Zugangsschlüssel geben. Er schlägt Kunden, Mails, Termine und Aufgaben mit deinen Rechten nach und legt, wenn du es erlaubst, Entwürfe, Termine, Kontakte und Aufgaben an.
- **Nichts verlässt das Haus von selbst**: kein Senden, kein Löschen; jede Änderung wird protokolliert, jede Verbindung lässt sich trennen.

### 🏢 Firmenverwaltung und Umzug

- **Mitarbeiter anlegen**, Passwort und zweiten Faktor zurücksetzen, **Zugang sperren**; **gemeinsame Postfächer** mit Rechten pro Person; weitere Adressen.
- **Abwesenheit für Kollegen** mit Vertretung, **Firmen-Signatur** für alle, **Austritt**, ohne etwas zu löschen.
- **Umzug** von Microsoft 365, Gmail, GMX und anderen IMAP-Anbietern (abgeglichen bis zum Wechsel), aus Outlook (PST) und aus einem Google-Export.

### 📱 Auf jedem Gerät

- **Eine App auf jedem Gerät** (PWA): aus dem Browser installieren am PC, unter Android und am iPhone, Ungelesen-Zahl am Symbol, Fotos aus anderen Apps in eine neue Mail teilen, `mailto:`-Links in Kontext öffnen.
- **Benachrichtigungen** auch bei geschlossener App (Web Push, Ende-zu-Ende verschlüsselt): neue Mails, Direktnachrichten, @Erwähnungen, Erinnerungen an Aufgaben und eingehende Anrufe.
- **Hell oder dunkel**, **Anmeldung mit zweitem Faktor**, **Speicherplatz auf einen Blick**.

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

### Was kostet das?
Die Software ist kostenlos (AGPL). Du brauchst einen Server – einen VPS ab etwa 5 € im Monat – und
jemanden, der ihn einrichtet und aktuell hält.

### Gibt es eine Weboberfläche für den Mailserver Stalwart?
Ja, das ist Kontext: ein JMAP-Webclient für Mail, Kalender und Kontakte auf
[Stalwart](https://stalw.art), dazu Aufgaben, Chat, Telefonie und eine Firmenverwaltung, die
Stalwarts Konten und Gruppen pflegt. Siehe [Architektur](https://firsttris.github.io/kontext/architecture.html).

### Funktioniert Kontext mit meiner Fritzbox (CTI)?
Ja. Eine Telefonbox im Büro meldet sich an der Fritzbox als IP-Telefon an; Anrufe klingeln dann in
Kontext mit Kontakt, letzter Mail und nächstem Termin des Anrufers, und du rufst aus jedem Kontakt
an. Siehe [Telefonie](https://firsttris.github.io/kontext/telephony.html).

### Läuft das auf meinem eigenen PC oder NAS?
Ja, Kontext läuft überall, wo Docker oder Podman läuft. Um Mails aus dem Internet zu empfangen,
braucht der Rechner aber Port 25 von außen, eine feste IP-Adresse und einen Reverse-DNS-Eintrag;
private Internetanschlüsse sperren Port 25 meist. Zu Hause geht es am besten mit einem Mail-Relay
davor – ein kleiner VPS ist einfacher. Die Telefonbox läuft auf einem NAS, einem Raspberry Pi oder
einem Thin Client im Büro.

### Ist das DSGVO-konform?
Es ist dafür gebaut: Die Daten bleiben auf deinem Server, ohne Tracker oder Dritte. Einen
Auftragsverarbeitungsvertrag schließt du mit deinem Hoster; bei einem Server im eigenen Haus
nicht einmal das. Für die GoBD wird beim Austritt nichts gelöscht, und Backups gehen verschlüsselt
auf S3-Speicher mit Object Lock.

### Funktionieren iPhone, Android, Outlook und Thunderbird weiter?
Ja. Stalwart spricht IMAP, SMTP, CalDAV und CardDAV; jedes Mailprogramm und Handy kann sich direkt
verbinden. Kontext ist die Oberfläche im Browser obendrauf, und die Aufgaben sind auch
CalDAV-Aufgabenlisten.

### Kann ich von Gmail, Microsoft 365 oder Outlook umziehen?
Ja, unter *Einstellungen → Firma → Umzug*: IMAP-Postfächer (abgeglichen, bis der Umzug
abgeschlossen ist), Microsoft 365 über eine App im Microsoft-Konto der Firma, Outlook als PST-Datei,
Kontakte und Kalender aus dem Google-Export. Siehe [Firmenverwaltung und Umzug](https://firsttris.github.io/kontext/company.html).

### Kann ich meine Gmail-Adresse weiter nutzen?
Ja, unter *Einstellungen → Weitere Postfächer*: Neue Mails kommen in Kontext an, und du sendest als
diese Adresse über den Server des Anbieters, damit Empfänger sie als echt sehen.

### Kann ich Claude oder andere KI-Agenten mit meinen Mails nutzen?
Ja, Kontext ist ein MCP-Server. Ein Agent arbeitet mit deinen Rechten, legt Entwürfe an statt zu
senden und löscht nie etwas. Siehe [KI-Agenten](https://firsttris.github.io/kontext/agents.html).

### Welche Sprachen?
Die App ist vorerst auf Deutsch; Englisch und weitere europäische Sprachen sind geplant.

## 📚 Dokumentation

Die ganze Dokumentation, mit Suche, steht unter **[firsttris.github.io/kontext](https://firsttris.github.io/kontext/)**.

| | |
| --- | --- |
| [Mail](https://firsttris.github.io/kontext/mail.html) | gemeinsame Postfächer, Kategorien, Regeln, Suche, weitere Postfächer, Prüfung des Absenders |
| [Kalender und Kontakte](https://firsttris.github.io/kontext/calendar-contacts.html) | Teilen, Verfügbarkeit, Videobesprechungen, Kundenansicht, vCard |
| [Aufgaben](https://firsttris.github.io/kontext/tasks.html) | Boards, Aufgaben aus Mails und Regeln, CalDAV für Thunderbird und Handy |
| [Team-Chat und Videocalls](https://firsttris.github.io/kontext/chat.html) | Kanäle, Karten, Anrufe über LiveKit, vertrauliche Unterhaltungen |
| [Telefonie (CTI)](https://firsttris.github.io/kontext/telephony.html) | Fritzbox, Telefonbox, Mailbox, Öffnungszeiten, Weitervermitteln, Snom, Fax |
| [Dokumente](https://firsttris.github.io/kontext/documents.html) | Schreibzeug als Modul, Ordner pro gemeinsamem Postfach |
| [Verschlüsselung](https://firsttris.github.io/kontext/encryption.html) | OpenPGP, S/MIME, vertraulich senden, Ende-zu-Ende verschlüsselter Chat |
| [KI-Agenten (MCP)](https://firsttris.github.io/kontext/agents.html) | Werkzeuge, OAuth und Zugangsschlüssel, was ein Agent darf |
| [Firmenverwaltung und Umzug](https://firsttris.github.io/kontext/company.html) | Mitarbeiter, gemeinsame Postfächer, Austritt, Microsoft 365, Gmail, PST |
| [Installation](https://firsttris.github.io/kontext/installation.html) | Server, DNS, Stalwart, Anrufe, Telefonie, Dokumente, Backups, Updates |
| [Architektur](https://firsttris.github.io/kontext/architecture.html) | wie Kontext, Stalwart, LiveKit und die Box zusammenspielen |
| [Entwicklung](https://firsttris.github.io/kontext/development.html) | lokal mit Testdaten, Tests, CI und Releases |

Was als Nächstes kommt, steht in der [Roadmap](ROADMAP.md).

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
Ansicht und was zu sehen war (ein Screenshot hilft). Vor einem Pull Request bitte
`bun run check && bun run e2e` laufen lassen.

---

<div align="center">

⭐ Gefällt dir Kontext? Ein [Stern auf GitHub](https://github.com/firsttris/kontext) hilft anderen, es zu finden.<br>
🐛 [Fehler melden](https://github.com/firsttris/kontext/issues/new) · 💡 [Idee vorschlagen](https://github.com/firsttris/kontext/issues/new)

<sub>Lizenz: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel und Mitwirkende · <a href="README.md">English version</a><br>
Wer eine veränderte Version weitergibt oder für andere betreibt, muss ihren Quellcode unter der AGPL anbieten; eine kommerzielle Lizenz ohne diese Pflichten gibt es über <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Kontext steht in keiner Verbindung zu Stalwart Labs, AVM (FRITZ!Box), Snom, Google, Microsoft oder Anthropic.</sub>

</div>
