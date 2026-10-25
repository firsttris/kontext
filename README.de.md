<div align="center">

<h1>Kontext</h1>

**Mail, Kalender und Kontakte, die dir gehören – wie Google Workspace, nur auf deinem eigenen Server.**<br>
Gemeinsame Postfächer, ein Kalender fürs Team und Kontakte, die alles verbinden: zu jedem Kunden die Mails und Termine auf einen Blick.<br>
Für Freelancer, Handwerk, Kanzleien und den Mittelstand – und für alle, die selbst hosten. Made in Europe, for Europe.

[English](README.md) · **Deutsch**

[![CI](https://github.com/firsttris/kontext/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/kontext/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-firsttris.github.io%2Fkontext-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/kontext/)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Stalwart 0.16](https://img.shields.io/badge/Stalwart-0.16-18181b)](https://stalw.art)

```bash
docker compose -f deploy/compose.yaml up -d
```

[Für wen](#-für-wen) •
[Datenschutz & GoBD](#-deine-daten-deine-regeln) •
[Installation](#-installation) •
[Funktionen](#-funktionen) •
[Module](#-module) •
[FAQ](#-faq) •
[Dokumentation](https://firsttris.github.io/kontext/)

<img src="docs/screenshots/mail.png" alt="Kontext im Browser: Posteingang mit Ordnern, gemeinsamen Postfächern info@ und rechnung@, Kategorien und einer geöffneten Mail mit Vorschau des PDF-Anhangs" width="900">

</div>

## 💡 Warum Kontext?

Google Workspace und Microsoft 365 sind bequem – aber jeder Benutzer kostet jeden Monat, und die
Daten liegen bei einem US-Konzern. Kontext bietet dasselbe Gefühl im Browser und am Handy, läuft
aber auf **deinem** Server: einem kleinen VPS ab etwa 5 € im Monat (z. B. bei IONOS oder Hetzner)
oder einem eigenen Rechner.

- **Alles gehört dir**: Mails, Termine und Kontakte liegen auf deinem Server, nicht bei einem Anbieter.
- **Keine Kosten pro Kopf**: zehn Mitarbeiter kosten dasselbe wie einer; bezahlt wird der Server.
- **Kontext statt Inseln**: zu jedem Kontakt die letzten Mails und nächsten Termine, Kategorien und Regeln für das ganze Team – ein kleines CRM ohne Extra-Tool.
- **Gemeinsame Postfächer**: info@ und rechnung@ für das Team, mit Rechten pro Person.
- **Am Handy wie am PC**: jede Ansicht ist fürs Handy gebaut; als App auf jedem Gerät installierbar – ohne App-Store.
- **Offen**: Open Source (AGPL), Standardprotokolle (JMAP, IMAP, CalDAV, CardDAV) – jedes Handy und Mailprogramm funktioniert weiter.

## 👥 Für wen?

- **Freelancer und Selbstständige**: eigene Adresse, Kalender und Kunden an einem Ort, für ein paar Euro im Monat statt eines Abos pro Dienst.
- **Handwerk, Kanzleien, Praxen, Mittelstand**: gemeinsame Postfächer, Firmenkalender, Abwesenheit mit Vertretung, Mitarbeiter anlegen und beim Austritt sauber übergeben – mit einer Firmenverwaltung, die der Chef ohne IT-Kenntnisse bedient.
- **Selfhoster**: ein Docker-Compose-Setup mit Stalwart als Mailserver, Backups und Updates dokumentiert.

## 🔒 Deine Daten, deine Regeln

- **DSGVO**: die Daten liegen auf deinem Server, auf Wunsch in einem deutschen Rechenzentrum. Keine Tracker, keine Werbung, keine Weitergabe; einen Auftragsverarbeitungsvertrag brauchst du nur mit deinem Hoster.
- **GoBD**: Kontext unterstützt die GoBD-gerechte Aufbewahrung – beim Austritt eines Mitarbeiters wird nichts gelöscht, Backups gehen verschlüsselt auf einen S3-Speicher mit Object Lock und sind damit unveränderbar. (GoBD-Konformität entsteht im Zusammenspiel mit den Abläufen im Betrieb und einer Verfahrensdokumentation; die Software ist ein Baustein davon.)
- **Kein Lock-in**: Mails, Kontakte und Kalender lassen sich jederzeit per IMAP, vCard und iCalendar mitnehmen; der Umzug *zu* Kontext ist eingebaut.
- **Sicher**: Anmeldung mit zweitem Faktor, Mails in einem abgeschotteten Rahmen, Warnungen vor gefälschten Absendern.

## 🚀 Installation

Auf einem Server mit Docker, eigener Domain und offenen Ports 25, 80, 443, 465, 587 und 993:

```bash
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env      # Domain, Mailserver-Name, Backup-Ziel eintragen
docker compose -f deploy/compose.yaml up -d
```

Danach in Stalwarts Verwaltung (Port 8080, nur über Tailscale) Domain, DKIM und Benutzer anlegen
und unter `https://<deine Domain>` anmelden. DNS-Einträge, Backups und Updates stehen in der
[Installationsanleitung](https://firsttris.github.io/kontext/installation.html). Für zehn Benutzer
reicht ein VPS mit 2 vCPU und 4 GB RAM.

## ✨ Funktionen

### ✉️ Mail

- **Gemeinsame Postfächer**: info@ & Co. stehen bei jedem Mitglied in der Seitenleiste; eine Mail daraus sagt „Gemeinsames Postfach info@…“. Antworten gehen als info@ raus, mit dem Namen der Person, die geantwortet hat. Postfächer nur zum Lesen zeigen nur, was erlaubt ist.
- **Alle Posteingänge in einer Liste**: eigene Mails und die aus info@ & Co. zusammen.
- **Vertraulich senden** an alle: Wer einen Schlüssel hat, bekommt PGP, alle anderen einen Link auf deinen eigenen Server und einen Code, den du am Telefon weitergibst – lesen, Anhänge laden und antworten geht dort.
- **Weitere Postfächer**: Gmail, GMX, WEB.DE & Co. behalten – neue Mails kommen alle zwei Minuten herein, gesendet wird als diese Adresse über ihren eigenen Server, Antworten gehen automatisch von der Adresse, an die die Mail ging.
- **Verschlüsselung**: dein eigener OpenPGP-Schlüssel, sicher verwahrt; verschlüsselt und unterschrieben senden, verschlüsselte Mails lesen und Unterschriften prüfen – direkt im Browser; Schlüssel anderer aus ihren Mails (Autocrypt), per WKD oder von keys.openpgp.org. Mehr im [Konzept](docs/encryption.md).
- **Lesebestätigung**: beim Senden anfordern, auf Nachfrage mit einem Klick bestätigen – nie von selbst.
- **Newsletter abbestellen** mit einem Klick, direkt an der Mail.
- **Bilder aus dem Internet** nur auf Wunsch – oder gleich bei Absendern, denen du vertraust (auch deinen Kontakten), wenn die Mail wirklich von ihnen kommt.
- **Kategorien**: farbige Markierungen wie „In Bearbeitung“, „Wartet auf Antwort“, „Erledigt“ – mehrere je Mail, eigene anlegbar, per Regel automatisch. In info@ & Co. sieht das ganze Team sie: ein kleines Aufgabenbrett.
- **Regeln**: „Wenn Absender, Empfänger, Betreff oder Text … dann in Ordner verschieben, markieren, Kategorie setzen, weiterleiten“ – laufen auf dem Server beim Eingang, auch wenn Kontext geschlossen ist; aus einer Mail heraus anlegbar und auf Wunsch auf den Posteingang anwendbar. Für gemeinsame Postfächer pflegt sie der Chef.
- **Mehrere Mails auf einmal**: auswählen (auch per Shift-Klick oder `x`) und gemeinsam archivieren, löschen, als gelesen markieren, kategorisieren oder verschieben.
- **Schutz vor gefälschten Mails**: eine Warnung über der Mail, wenn der Absender nicht bestätigt ist, sich jemand von außen als die eigene Firma ausgibt oder Antworten an eine fremde Adresse gehen; „Details anzeigen“ zeigt die Prüfung (SPF, DKIM, DMARC, Spam-Bewertung).
- **Als Spam markieren**: ein Klick (oder `!`), „Kein Spam“ holt sie zurück – der Spamfilter lernt aus beidem.
- **Ordner und Unterordner**: Mails per Menü oder mit der Maus verschieben, auch zwischen info@ und den eigenen Ordnern; Archiv und Papierkorb mit einem Klick.
- **Schreiben mit Formatierung**, Antworten mit Zitat, Anhänge, Vorschläge aus den Kontakten.
- **Wer schreibt mir da?** Auf breiten Bildschirmen steht neben der Mail der Absender mit Firma, nächsten Terminen und letzten Mails.
- **Anhänge mit Vorschau**: Fotos und die erste Seite eines PDFs als kleines Bild.
- **Suche wie in Gmail**: über alle Ordner und Postfächer, mit `von:`, `an:`, `betreff:`, `hat:anhang`, `kategorie:`, `in:info@`, `nach:`/`vor:`; „Angebote“ findet auch „Angebot“.
- **Unterhaltungen ohne Durcheinander**: Die Liste bleibt, wie die Mails hereinkommen; beim Lesen stehen die früheren Mails der Unterhaltung und die Antworten seitdem dabei, Zitate eingeklappt. In gemeinsamen Postfächern siehst du, wer schon geantwortet hat („Jonas · 14:02“). Gruppieren wie bei Gmail ist ein Schalter.
- **Senden rückgängig und später senden**: ein paar Sekunden, um eine Mail zurückzuholen; „morgen 8 Uhr“ oder ein Zeitpunkt nach Wahl, und der Server schickt sie dann – auch wenn dein Rechner aus ist.
- **Wiedervorlage**: eine Mail bis morgen, Montag oder einen Zeitpunkt nach Wahl aus dem Weg; dann liegt sie wieder oben im Posteingang, ungelesen – auch bei geschlossenem Kontext, und in info@ für das ganze Team sichtbar.
- **Textbausteine**: Standardantworten mit zwei Klicks, eigene und gemeinsame für info@ & Co.; `{Name}` wird zum Empfänger.
- **Drucken**: die Mail allein, sauber auf A4 (auch per Strg+P).
- **Sofort aktuell**: neue Mails und Änderungen von Kollegen erscheinen ohne Neuladen (JMAP Push).

### ✅ Aufgaben

- **Aufgaben für dich und das Team**: Meine Aufgaben, Heute, Demnächst, Erledigt; ein Board fürs eigene Postfach und eins pro gemeinsamem Postfach (info@, rechnung@).
- **Liste oder Kanban**: nach Fälligkeit gruppiert, oder als Board mit Offen, In Arbeit, Wartet, Erledigt – Karten zwischen den Spalten ziehen.
- **Aus einer Mail**: „Aufgabe“ (oder `t`) macht aus einer Mail eine Aufgabe mit Betreff, Fälligkeit und Zuständigem; die Mail zeigt danach ihre Aufgabe.
- **In Thunderbird und auf dem Handy**: deine Boards als Aufgabenlisten über CalDAV (Thunderbird, DAVx⁵ mit tasks.org, Apple Erinnerungen), in beide Richtungen.
- **Aufgaben aus Regeln**: Eine Mail-Regel macht aus jeder passenden Mail eine Aufgabe, auch wenn Kontext geschlossen ist.
- **Eigene Spalten** pro Board („Material bestellt“ …) und **wiederkehrende Aufgaben** (täglich, an Werktagen, wöchentlich, monatlich, jährlich).
- **Schnelleingabe**: „Rückruf Hoffmann morgen“ ist morgen fällig; Checkliste, Notiz, Zuständige.
- **Überall in Kontext**: Der Kontakt zeigt seine offenen Aufgaben, der Kalender das Fällige am Tag, die Glocke neu Zugewiesenes und heute Fälliges. Erinnerungen kommen als Benachrichtigung, auch bei geschlossener App. „Aufgaben erstellen“ macht aus mehreren ausgewählten Mails je eine Aufgabe.
- **Live**: Neue oder verschobene Aufgaben von Kollegen erscheinen sofort.

### 💬 Team-Chat

- **Kanäle**: #allgemein für alle, einer pro gemeinsamem Postfach (info@, rechnung@) für alle, die darin arbeiten, und eigene wie #baustelle-hoffmann mit ausgewählten Mitgliedern.
- **Direktnachrichten** an eine Kollegin oder ein paar Kollegen, mit „Gelesen“.
- **Live**: Nachrichten, „Sandra schreibt …“ und wer online ist, ohne Neuladen; Ungelesenes am Chat und am App-Symbol.
- **@Erwähnungen** mit Vorschlägen beim Tippen; eine Erwähnung oder Direktnachricht kommt aufs Handy, auch wenn Kontext geschlossen ist.
- **Fotos und Dateien**: mit der Handykamera, per Ziehen oder Einfügen; Fotos werden vor dem Senden verkleinert.
- **Mails, Aufgaben und Kontakte als Karten**: „Besprechen“ an einer Mail (`b`) spricht im Kanal darüber, statt sie intern weiterzuleiten; die Mail zeigt danach, wo sie besprochen wurde. Öffnen kann die Karte nur, wer das Postfach sehen darf – kopiert wird nichts.
- **Antworten im Thread und Reaktionen**: auf eine Nachricht antworten, ohne den Kanal vollzuschreiben; 👍 ✅ 🎉 statt noch einem „Ok“.
- **Mail als Kopie teilen**, mit Anhängen, für Kolleginnen ohne Zugriff auf das Postfach.
- **Aufgabe aus einer Nachricht**, in beide Richtungen verknüpft.
- **Anrufe und Videoanrufe** direkt aus der Unterhaltung: eine Kollegin anrufen oder im Kanal eine Besprechung starten, der die anderen beitreten; stummschalten, Kamera, Bildschirm teilen, und das Gespräch bleibt offen, während du zur Mail wechselst; verpasste Anrufe und die Dauer stehen im Verlauf. Läuft auf dem eigenen Server ([LiveKit](https://github.com/livekit/livekit), optional).
- **Telefonieren in Kontext**: Eine kleine Telefonbox im Büro meldet sich als IP-Telefon an der Fritzbox an. Anrufe klingeln in Kontext mit dem Wichtigsten zum Anrufer (Kontakt, Firma, letzte Mail, nächster Termin), du nimmst im Browser oder am Tischtelefon ab, rufst aus jedem Kontakt an, und verpasste Anrufe stehen mit Notiz und „Zurückrufen“ in einer Liste.
- **Suche** über alle deine Kanäle; eigene Nachrichten bearbeiten oder löschen; Kanäle stummschalten, verlassen oder löschen.
- **Aufbewahrung**, die die Firmenverwaltung festlegt (30 Tage bis 5 Jahre oder unbegrenzt): Ältere Nachrichten, Fotos und Dateien löscht Kontext von selbst.
- **Am Handy**: ein eigener Tab, Unterhaltungen als Sprechblasen.

### 📅 Kalender

- **Tag, Woche, Monat und Liste**, Termine mit der Maus verschieben, wiederkehrende Termine mit Ausnahmen.
- **Videobesprechung am Termin**: ein Klick legt einen Link an; Kunden treten im Browser bei, ohne Konto – sobald jemand aus deiner Firma da ist.
- **Kalender teilen** mit Kollegen – zum Lesen oder Bearbeiten; **Einladungen** mit Zusage und Absage.
- **Am Handy**: Tagesansicht mit Wochenleiste, Monat und Liste.

### 👥 Kontakte

- **Kunde auf einen Blick**: letzte Mails und nächste Termine mit diesem Kontakt.
- **Gruppen** wie „Lieferanten“, an die man mit einer Mail schreibt; **vCard-Import und -Export**.
- **Adressbücher teilen** mit Kollegen – zum Lesen oder Bearbeiten.

### ⚙️ Einstellungen

- **Signatur pro Absender**, **Abwesenheitsnotiz** mit Zeitraum, **Anmeldung mit Code** (Authenticator-App).
- **Hell oder dunkel**, **Tastaturkürzel** wie in Gmail (`?` zeigt alle).
- **Als App auf jedem Gerät**: Kontext aus dem Browser installieren (PC, Android, iPhone) – eigenes Fenster und Symbol, Ungelesen-Zahl am Symbol, startet auch ohne Netz; Fotos und Dateien aus anderen Apps direkt in eine neue Mail teilen; `mailto:`-Links öffnen Kontext. Neue Versionen kommen zuverlässig an und laden auf Klick auf „Neu laden“.
- **Benachrichtigungen**: Glocke mit Einladungen, heutigen Terminen und neuen Mails; auf deinen Geräten auch bei geschlossener App (Web Push, Ende-zu-Ende verschlüsselt): neue Mails, Direktnachrichten, @Erwähnungen und eingehende Anrufe.
- **Speicherplatz im Blick**: ein feiner Ring um das eigene Bild zeigt, wie voll das Postfach ist.

### 🏢 Firmenverwaltung

- **Mitarbeiter anlegen**, Passwort und zweiten Faktor zurücksetzen, **Zugang sperren**.
- **Gemeinsame Postfächer** mit Rechten pro Person: kein Zugriff, nur lesen, oder lesen und senden; weitere Adressen wie buchhaltung@.
- **Abwesenheit eintragen** mit Vertretung, **Firmen-Signatur** für alle.
- **Austritt**: Zugang sperren, Postfach übergeben, weiterleiten, automatisch antworten – gelöscht wird nichts.
- **Umzug** von Microsoft 365, Gmail, GMX, WEB.DE & Co. (mit Ordnern und Kategorien, danach laufender Abgleich), aus Outlook (PST) und dem Google-Export.

## 🧩 Module

Kontext bleibt im Kern schlank: Mail, Kalender, Kontakte und die Firmenverwaltung. Dazu kommen
Module, die ein Betrieb einschaltet, wenn er sie braucht – wer sie nicht braucht, sieht sie nicht.

| Modul | Stand |
| --- | --- |
| Mail, Kalender, Kontakte, Firmenverwaltung | ✅ verfügbar |
| Aufgaben und Kanban-Board | ✅ verfügbar |
| Team-Chat | ✅ verfügbar |
| Anrufe und Videobesprechungen im Chat | ✅ verfügbar |
| Telefonie über die Fritzbox (Telefonbox) | 🧪 im Test |
| Rapportzettel (Arbeitsnachweise, z. B. im Handwerk) | geplant |

Was als Nächstes kommt, steht in der [Roadmap](ROADMAP.md).

## 📸 Screenshots

<table>
  <tr>
    <td><img src="docs/screenshots/shared-mailbox.png" alt="Gemeinsames Postfach info@: Kundenanfrage zur Wärmepumpe mit der Kategorie „In Bearbeitung“"></td>
    <td><img src="docs/screenshots/compose.png" alt="Antwort schreiben mit Formatierungsleiste, Zitat und Absender-Auswahl"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/calendar.png" alt="Kalender-Wochenansicht mit Baubesprechung, Wartungstermin und Monatsübersicht"></td>
    <td><img src="docs/screenshots/contacts.png" alt="Kontakt Markus Hoffmann mit nächsten Terminen und letzten Mails"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/tasks-board.png" alt="Kanban-Board des gemeinsamen Postfachs info@ mit Offen, In Arbeit, Wartet und Erledigt"></td>
    <td><img src="docs/screenshots/chat.png" alt="Team-Chat-Kanal mit Aufmaß von der Baustelle, einer Kundenmail als Karte und einer Aufgabe aus einer Nachricht"></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mail-dark.png" alt="Posteingang im dunklen Farbschema" width="720">
</p>

<p align="center">
  <img src="docs/screenshots/phone-mail.png" alt="Posteingang am Handy mit Tab-Leiste" width="200">
  <img src="docs/screenshots/phone-read.png" alt="Mail lesen am Handy" width="200">
  <img src="docs/screenshots/phone-calendar.png" alt="Kalender-Tagesansicht am Handy" width="200">
  <img src="docs/screenshots/phone-chat.png" alt="Team-Chat am Handy mit Sprechblasen, einer Datei und einer Mail-Karte" width="200">
</p>

## 🔀 Kontext und die Alternativen

|                                                                 | Was es ist                                  | Wo Kontext anders ist                                                     |
| --------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- |
| [Google Workspace](https://workspace.google.com)                | Gmail, Kalender, Drive als Abo pro Benutzer | eigener Server, keine Kosten pro Kopf, Daten in Europa                    |
| [Microsoft 365](https://www.microsoft.com/microsoft-365)        | Outlook und Office als Abo pro Benutzer     | läuft im Browser ohne Outlook, Daten auf dem eigenen Server               |
| [Roundcube](https://roundcube.net), [SOGo](https://www.sogo.nu) | bewährte Webmailer                          | moderne Oberfläche, fürs Handy gebaut, Kontakte mit Kunden-Ansicht        |
| Bulwark                                                         | JMAP-Webmail für Stalwart                   | Kalender, Kontakte, Firmenverwaltung, Regeln und Kategorien fürs Team     |

## ❓ FAQ

### Was kostet es?

Die Software ist kostenlos (AGPL). Es braucht einen Server – ein VPS ab etwa 5 € im Monat – und
jemanden, der ihn einrichtet und aktualisiert.

### Geht es auch auf meinem eigenen PC?

Ja, Kontext läuft überall, wo Docker läuft. Für Mail aus dem Internet braucht der Rechner aber
Port 25 von außen, eine feste IP-Adresse und einen Reverse-DNS-Eintrag; private Internetanschlüsse
sperren Port 25 meist. Zu Hause klappt es daher am besten mit einem Mail-Relay davor – einfacher
ist ein kleiner VPS.

### Ist das DSGVO-konform?

Kontext ist dafür gebaut: die Daten bleiben auf deinem Server, ohne Tracker und ohne
Drittanbieter. Mit dem Hoster des Servers schließt du einen Auftragsverarbeitungsvertrag; bei
einem Server im eigenen Haus entfällt auch das.

### Und die GoBD?

Kontext löscht beim Austritt nichts und sichert unveränderbar (S3 mit Object Lock). Für die
GoBD gehören dazu auch die Abläufe im Betrieb und eine Verfahrensdokumentation – die Software ist
ein Baustein, kein Zertifikat.

### Funktionieren iPhone, Android, Outlook und Thunderbird weiter?

Ja. Stalwart spricht IMAP, SMTP, CalDAV und CardDAV; jedes Mailprogramm und jedes Handy kann sich
direkt verbinden. Kontext ist die Oberfläche im Browser dazu.

### Kann ich von Gmail, Microsoft 365 oder Outlook umziehen?

Ja, unter *Einstellungen → Firma → Umzug*: IMAP-Postfächer verbinden (läuft parallel weiter, bis
der Umzug abgeschlossen ist), Microsoft 365 über eine App im Microsoft-Konto der Firma, Outlook als
PST-Datei, Kontakte und Kalender aus dem Google-Export.

### Kann ich meine Gmail-Adresse weiter benutzen?

Ja, unter *Einstellungen → Weitere Postfächer*: Adresse und (App-)Passwort eintragen. Neue Mails
kommen in Kontext an, und du sendest als diese Adresse über den Server des Anbieters – so kommen
die Mails auch beim Empfänger als echt an. Beim Anbieter wird nichts gelöscht.

### In welcher Sprache ist die App?

Derzeit Deutsch; Englisch und weitere europäische Sprachen sind geplant.

## 📚 Dokumentation

Die ganze Dokumentation steht unter **[firsttris.github.io/kontext](https://firsttris.github.io/kontext/)**.

| Seite | Inhalt |
| --- | --- |
| [Installation](https://firsttris.github.io/kontext/installation.html) | Server, DNS (MX, SPF, DKIM, DMARC), erster Start, Backups, Updates |
| [Architektur](https://firsttris.github.io/kontext/architecture.html) | wie App, Caddy und Stalwart zusammenspielen |
| [Entwicklung](https://firsttris.github.io/kontext/development.html) | lokaler Stalwart mit Testdaten, Tests, CI, Releases |

## 🛠️ Entwicklung

Benötigt [Bun](https://bun.sh) 1.4 und Linux oder macOS.

```bash
git clone https://github.com/firsttris/kontext && cd kontext
bun install
bun run dev   # Stalwart mit Testdaten, Server und App: http://localhost:5173
```

Anmelden mit `jonas@weber-haustechnik.test` / `kaffee-werkbank-kontext` (Chef, sieht auch die
Firmenverwaltung); `anna@`, `sandra@` und `max@` haben dasselbe Passwort, info@ und rechnung@ sind
gemeinsame Postfächer. `bun run dev:stalwart -- --fresh --seed` setzt die Testdaten zurück. Für
den Umzug aus Outlook braucht es lokal `readpst` (`sudo apt install pst-utils`).

React, TanStack Router/Query, Tailwind und Tiptap im Browser; ein kleiner Bun-Server mit Hono und
Better Auth für Anmeldung und JMAP zu Stalwart. Architektur, Tests und Releases:
[Entwicklung](https://firsttris.github.io/kontext/development.html).

## 🤝 Mitmachen

Was als Nächstes geplant ist, steht in der [Roadmap](ROADMAP.md).

Issues und Pull Requests sind willkommen. Ein guter Fehlerbericht nennt Browser oder Handy, die
Ansicht und was zu sehen war (ein Screenshot hilft). Vor einem Pull Request bitte
`bun run check && bun run e2e` laufen lassen.

---

<div align="center">

⭐ Gefällt dir Kontext? Ein [Stern auf GitHub](https://github.com/firsttris/kontext) hilft anderen, es zu finden.<br>
🐛 [Fehler melden](https://github.com/firsttris/kontext/issues/new) · 💡 [Funktion vorschlagen](https://github.com/firsttris/kontext/issues/new)

<sub>Lizenz: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel und Mitwirkende<br>
Geänderte Versionen, die du weitergibst oder für andere betreibst, müssen ihren Quellcode unter der AGPL anbieten; eine kommerzielle Lizenz ohne diese Pflichten gibt es über <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Kontext ist nicht mit Stalwart Labs, Google oder Microsoft verbunden.</sub>

</div>
