<div align="center">

<h1>Sekretär: Mail, Kalender und Kontakte für kleine Betriebe – selbst gehostet</h1>

**Sekretär ist eine Büro-Suite für Handwerk, Kanzleien und kleine Firmen: Mail mit gemeinsamen Postfächern, Kalender und Kontakte im Browser und am Handy.**<br>
Sie läuft auf einem eigenen Server pro Firma (Stalwart Mailserver), die Daten bleiben in Deutschland.<br>
Open Source (AGPL), keine Lizenz pro Benutzer – eine Alternative zu Google Workspace und Microsoft 365.

[![CI](https://github.com/firsttris/sekretaer/actions/workflows/ci.yml/badge.svg)](https://github.com/firsttris/sekretaer/actions/workflows/ci.yml)
[![Docs](https://img.shields.io/badge/docs-firsttris.github.io%2Fsekretaer-4f46e5?logo=materialformkdocs&logoColor=white)](https://firsttris.github.io/sekretaer/)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Stalwart 0.16](https://img.shields.io/badge/Stalwart-0.16-18181b)](https://stalw.art)

```bash
docker compose -f deploy/compose.yaml up -d
```

[Installation](#-installation) •
[Funktionen](#-funktionen) •
[Screenshots](#-screenshots) •
[Alternativen](#-sekretär-und-die-alternativen) •
[FAQ](#-faq) •
[Dokumentation](https://firsttris.github.io/sekretaer/)

<img src="docs/screenshots/mail.png" alt="Sekretär im Browser: Posteingang mit Ordnern, gemeinsamen Postfächern info@ und rechnung@ und einer geöffneten Mail mit Vorschau des PDF-Anhangs" width="900">

</div>

## 💡 Warum Sekretär?

Viele kleine Betriebe arbeiten mit einer kostenlosen Gmail-Adresse oder dem Postfach vom Hoster:
kein gemeinsames info@-Postfach, kein Firmenkalender, und mit jedem Mitarbeiter wird Workspace
oder Microsoft 365 teurer.
- **Gemeinsame Postfächer**: info@ und rechnung@ für das ganze Team, mit Rechten pro Person.
- **Beliebig viele Benutzer**: bezahlt wird die Wartung des Servers, nicht jeder Kopf.
- **Ordner statt Labels**: Posteingang, Archiv und eigene Ordner mit Unterordnern, wie gewohnt.
- **Am Handy wie am PC**: jede Ansicht ist fürs Handy gebaut, als App installierbar, man bleibt angemeldet.
- **Ihre Daten, Ihr Server**: ein eigener Server pro Firma, Backups verschlüsselt auf S3.

Läuft auf jedem Linux-Server mit Docker oder Podman, z. B. einem kleinen VPS bei IONOS oder Hetzner.

## 🚀 Installation

Auf einem Server mit Docker, eigener Domain und offenen Ports 25, 80, 443, 465, 587 und 993:

```bash
git clone https://github.com/firsttris/sekretaer /opt/sekretaer && cd /opt/sekretaer
cp deploy/.env.example deploy/.env      # Domain, Mailserver-Name, Backup-Ziel eintragen
docker compose -f deploy/compose.yaml up -d
```

Danach in Stalwarts Verwaltung (Port 8080, nur über Tailscale) Domain, DKIM und Benutzer anlegen
und unter `https://<Ihre Domain>` anmelden. DNS-Einträge, Backups und Updates stehen in der
[Installationsanleitung](https://firsttris.github.io/sekretaer/installation.html).

## ✨ Funktionen

### ✉️ Mail

- **Gemeinsame Postfächer**: info@ & Co. stehen bei jedem Mitglied in der Seitenleiste; eine Mail daraus sagt „Gemeinsames Postfach info@…“, damit man sieht, wo sie liegt. Antworten gehen als info@ raus, mit dem Namen der Person, die geantwortet hat. Postfächer nur zum Lesen zeigen nur, was erlaubt ist.
- **Alle Posteingänge in einer Liste**: eigene Mails und die aus info@ & Co. zusammen, das gemeinsame Postfach als kleines Etikett.
- **Schutz vor gefälschten Mails**: eine Warnung über der Mail, wenn der Absender nicht bestätigt ist, sich jemand von außen als die eigene Firma ausgibt oder Antworten an eine fremde Adresse gehen; „Details anzeigen“ zeigt Empfänger, Datum und die Prüfung des Absenders (SPF, DKIM, DMARC, Spam-Bewertung).
- **Als Spam markieren**: ein Klick (oder `!`) verschiebt die Mail in den Spam, „Kein Spam“ holt sie zurück – der Spamfilter lernt aus beidem.
- **Ordner und Unterordner**: anlegen, Mails verschieben – über das Menü oder mit der Maus auf einen Ordner gezogen, auch von info@ in die eigenen Ordner und zurück –, Archiv und Papierkorb mit einem Klick.
- **Schreiben mit Formatierung**: Fett, Listen, Einrücken, Links, Zitate – die Leiste ist immer sichtbar.
- **Antworten, allen antworten, weiterleiten**: mit Zitat, Anhängen und Vorschlägen aus den Kontakten.
- **Wer schreibt mir da?** Auf breiten Bildschirmen steht neben der Mail der Absender mit Firma, nächsten Terminen und letzten Mails, dazu Mail, Termin und Anrufen mit einem Klick – und „Als Kontakt speichern“, wenn er noch fehlt.
- **Anhänge mit Vorschau**: Fotos und die erste Seite eines PDFs als kleines Bild, andere Dateien als farbige Kachel (Word, Excel, ZIP …); ein Klick öffnet PDF und Foto direkt im Browser.
- **Suche wie in Gmail**: über alle Ordner und Postfächer, mit `von:`, `an:`, `betreff:`, `hat:anhang`, `ist:ungelesen`, `in:info@`, `nach:`/`vor:` (auch auf Englisch), Vorschlägen beim Tippen, Filter-Chips und markierten Treffern; „Angebote“ findet auch „Angebot“.
- **Sicher lesen**: Mails laufen in einem abgeschotteten Rahmen, Bilder aus dem Internet erst auf Wunsch.
- **Sofort aktuell**: neue Mails und Änderungen von Kollegen erscheinen ohne Neuladen (JMAP Push).

### ⚙️ Einstellungen

- **Signatur pro Absender**: eigene Adresse und gemeinsame Postfächer, mit Formatierung.
- **Abwesenheitsnotiz**: mit Zeitraum, antwortet automatisch.
- **Mehrere Mails auf einmal**: auswählen (auch per Shift-Klick oder `x`) und gemeinsam archivieren, löschen, als gelesen markieren, kategorisieren oder verschieben – auch über mehrere Postfächer in „Alle Posteingänge“.
- **Kategorien**: farbige Markierungen wie „In Bearbeitung“, „Wartet auf Antwort“, „Erledigt“ – mehrere je Mail, eigene anlegbar, per Regel automatisch. In info@ & Co. sieht das ganze Team sie: ein kleines Aufgabenbrett ohne Extra-Tool.
- **Regeln**: „Wenn Absender/Empfänger/Betreff/Text … dann in Ordner verschieben, als gelesen markieren, markieren, weiterleiten“ – laufen auf dem Server beim Eingang, auch wenn Sekretär geschlossen ist; direkt aus einer Mail anlegbar („Regel erstellen …“) und auf Wunsch auch auf die Mails anwendbar, die schon im Posteingang liegen.
- **Passwort und Anmeldung mit Code** (Authenticator-App); man bleibt auf dem Gerät angemeldet.
- **Hell oder dunkel**: wie das Gerät, oder fest eingestellt.
- **Tastaturkürzel** wie in Gmail: `j`/`k` durch die Mails, `r` antworten, `e` archivieren, `c` neu, `?` oder das Tastatur-Symbol links zeigt alle.
- **Benachrichtigungen**: die Glocke links zeigt Einladungen, die auf Antwort warten, die heutigen Termine und neue Mails aus allen Postfächern; auf Wunsch meldet sich Sekretär auch als Benachrichtigung des Geräts – bei neuer Mail im Hintergrund und 15 Minuten vor einem Termin.
- **Speicherplatz im Blick**: ein feiner Ring um das eigene Bild zeigt, wie voll das Postfach ist – gelb ab 80 %, rot ab 95 %.

### 🏢 Firmenverwaltung

- **Mitarbeiter anlegen**: mit Startpasswort zum Weitergeben, gleich in den passenden gemeinsamen Postfächern.
- **Passwort und Anmeldung mit Code zurücksetzen**, z. B. wenn ein Handy verloren geht.
- **Zugang sperren**: keine Anmeldung mehr, weder in Sekretär noch am Handy oder im Mailprogramm; Mails kommen weiter an.
- **Weitere Adressen** wie buchhaltung@ für eine Person oder ein Postfach.
- **Gemeinsame Postfächer** anlegen und pro Person festlegen: kein Zugriff, nur lesen, oder lesen und senden.
- **Abwesenheit eintragen**, wenn jemand krank ist – mit Vertretung, die in der automatischen Antwort steht.
- **Regeln für gemeinsame Postfächer**: z. B. Reklamationen an info@ markieren oder Rechnungen in einen Ordner sortieren – für alle, die das Postfach nutzen.
- **Firmen-Signatur**: eine Vorlage mit Name und Adresse, mit einem Klick für alle übernommen; neue Mitarbeiter bekommen sie automatisch.
- **Umzug von Microsoft 365**: Mails mit Ordnern, Kontakte und Termine (auch Serien) über eine App im Microsoft-Konto der Firma, Postfach für Postfach zugeordnet, danach laufender Abgleich.
- **Umzug von Gmail, GMX, WEB.DE & Co.**: altes Postfach verbinden – alle Mails mit Ordnern (Gmail-Labels inklusive) kommen herüber, danach gleicht Sekretär alle 15 Minuten ab, bis der Umzug abgeschlossen ist.
- **Umzug aus Outlook und Google-Export**: PST-Datei, Kontakte (.vcf) oder Kalender (.ics) hochladen – ohne Doppelte beim zweiten Mal.
- **Austritt**: Zugang sperren, Postfach einer Kollegin übergeben, neue Mails weiterleiten und automatisch antworten – gelöscht wird nichts.
- Nur für Konten mit dem Recht „Firmenverwaltung“, das der Chef auch weitergeben kann.

### 📅 Kalender

- **Tag, Woche, Monat und Liste**: überlappende Termine nebeneinander, ganztägige oben, Jetzt-Linie; die Liste zeigt die nächsten 30 Tage.
- **Termine verschieben**: mit der Maus ziehen, die Länge am unteren Rand ändern.
- **Wiederkehrende Termine**: täglich, werktags, wöchentlich, alle 2 Wochen, monatlich, jährlich – bis zu einem Datum oder eine Anzahl lang; einzelne Termine der Serie ändern oder absagen.
- **Kalender teilen**: eigene Kalender anlegen und mit Kollegen teilen – zum Lesen oder zum Bearbeiten; jeder Kalender in seiner Farbe, einzeln ein- und ausblendbar.
- **Einladungen**: Teilnehmer bekommen eine Einladung und können zusagen, absagen oder „vielleicht“.
- **Am Handy**: Tagesansicht mit Wochenleiste, Monat und Liste, Plus-Knopf.

### 👥 Kontakte

- **Kunde auf einen Blick**: letzte Mails und nächste Termine mit diesem Kontakt.
- **Anlegen und pflegen**: Firma, Mail, Telefon, Adresse, Notiz; Anrufen und Mail schreiben mit einem Tipp.
- **Gruppen**: Kontakte zu Gruppen wie „Lieferanten“ zusammenfassen und allen mit einer Mail schreiben; beim Schreiben schlägt Sekretär die Gruppe vor.
- **vCard-Import und -Export**: Kontakte aus Outlook, Google oder dem Handy übernehmen (ohne Doppelte) und ganze Adressbücher oder einzelne Kontakte als `.vcf` sichern.
- **Adressbücher teilen**: eigene Adressbücher anlegen und mit Kollegen teilen – zum Lesen oder zum Bearbeiten. Geteilte Adressbücher und die der gemeinsamen Postfächer stehen unter „Geteilt mit mir“.

## 📸 Screenshots

<table>
  <tr>
    <td><img src="docs/screenshots/shared-mailbox.png" alt="Gemeinsames Postfach info@ mit einer Kundenanfrage zur Wärmepumpe"></td>
    <td><img src="docs/screenshots/compose.png" alt="Antwort schreiben mit Formatierungsleiste, Zitat und Absender-Auswahl"></td>
  </tr>
  <tr>
    <td><img src="docs/screenshots/calendar.png" alt="Kalender-Wochenansicht mit Baubesprechung, Wartungstermin und Monatsübersicht"></td>
    <td><img src="docs/screenshots/contacts.png" alt="Kontakt Markus Hoffmann mit nächsten Terminen und letzten Mails"></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/mail-dark.png" alt="Posteingang im dunklen Farbschema" width="720">
</p>

<p align="center">
  <img src="docs/screenshots/phone-mail.png" alt="Posteingang am Handy mit Tab-Leiste" width="240">
  <img src="docs/screenshots/phone-read.png" alt="Mail lesen am Handy" width="240">
  <img src="docs/screenshots/phone-calendar.png" alt="Kalender-Tagesansicht am Handy" width="240">
</p>

## 🔀 Sekretär und die Alternativen

Sekretär ist für Betriebe gemacht, die ihre Mail selbst (oder durch ihren IT-Dienstleister) betreiben wollen und eine Oberfläche brauchen, die so einfach ist wie Gmail.

|                                                                 | Was es ist                                  | Wo Sekretär anders ist                                                              |
| --------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- |
| [Google Workspace](https://workspace.google.com)                | Gmail, Kalender, Drive als Abo pro Benutzer | eigener Server, keine Kosten pro Kopf, Ordner statt Labels                          |
| [Microsoft 365](https://www.microsoft.com/microsoft-365)        | Outlook und Office als Abo pro Benutzer     | läuft im Browser ohne Outlook, Daten auf dem eigenen Server                         |
| [Stalwart Web-Admin](https://stalw.art)                         | Verwaltung des Mailservers                  | Sekretär ist die App für die Mitarbeiter, Stalwart der Server darunter              |
| [Roundcube](https://roundcube.net), [SOGo](https://www.sogo.nu) | bewährte Webmailer                          | moderne Oberfläche, fürs Handy gebaut, gemeinsame Postfächer im Mittelpunkt         |
| Bulwark                                                         | JMAP-Webmail für Stalwart                   | Kalender und Kontakte mit Kunden-Ansicht, Teilen mit Kollegen, deutsche Oberfläche |

## ❓ FAQ

### Funktionieren iPhone, Android, Outlook und Thunderbird weiter?

Ja. Stalwart spricht IMAP, SMTP, CalDAV und CardDAV; jedes Mailprogramm und jedes Handy kann sich direkt verbinden. Sekretär ist die Oberfläche im Browser dazu.

### Kann ich von Gmail, Microsoft 365 oder Outlook umziehen?

Ja, unter *Einstellungen → Firma → Umzug*: Gmail, GMX, WEB.DE, Telekom, IONOS, STRATO und andere IMAP-Postfächer verbinden (läuft parallel weiter, bis der Umzug abgeschlossen ist), Microsoft 365 über eine App im Microsoft-Konto der Firma, Outlook als PST-Datei hochladen, Kontakte und Kalender aus dem Google-Export als .vcf und .ics.

### Was kostet es?

Die Software ist kostenlos (AGPL). Es braucht einen Server (ab ca. 5 € im Monat) und jemanden, der ihn wartet.

### Wo liegen die Daten?

Auf dem Server der Firma, z. B. in einem deutschen Rechenzentrum. Backups gehen verschlüsselt mit Restic auf einen S3-Speicher mit Object Lock.

## 📚 Dokumentation

Die ganze Dokumentation steht unter **[firsttris.github.io/sekretaer](https://firsttris.github.io/sekretaer/)**.

|                                                                         |                                                                    |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [Installation](https://firsttris.github.io/sekretaer/installation.html) | Server, DNS (MX, SPF, DKIM, DMARC), erster Start, Backups, Updates |
| [Architektur](https://firsttris.github.io/sekretaer/architecture.html)  | wie App, Caddy und Stalwart zusammenspielen                        |
| [Entwicklung](https://firsttris.github.io/sekretaer/development.html)   | lokaler Stalwart mit Testdaten, Tests, CI, Releases                |

## 🛠️ Entwicklung

Benötigt [Bun](https://bun.sh) 1.4 und Linux oder macOS.

```bash
git clone https://github.com/firsttris/sekretaer && cd sekretaer
bun install
bun run dev   # Stalwart mit Testdaten, Server und App: http://localhost:5173
```

Anmelden mit `jonas@weber-haustechnik.test` / `kaffee-werkbank-sekretaer` (Chef, sieht auch die Firmenverwaltung); `anna@`, `sandra@` und `max@` haben dasselbe Passwort, info@ und rechnung@ sind gemeinsame Postfächer. `bun run dev:stalwart -- --fresh --seed` setzt die Testdaten zurück. Für den Umzug aus Outlook braucht es lokal `readpst` (`sudo apt install pst-utils`); wie man den Umzug per IMAP und von Microsoft 365 ohne echte Konten ausprobiert, steht in der Entwicklungs-Doku.

React, TanStack Router/Query, Tailwind und Tiptap im Browser; ein kleiner Bun-Server mit Hono und Better Auth für Anmeldung und JMAP zu Stalwart. Architektur, Tests und Releases: [Entwicklung](https://firsttris.github.io/sekretaer/development.html).

## 🤝 Mitmachen

Issues und Pull Requests sind willkommen. Ein guter Fehlerbericht nennt Browser oder Handy, die Ansicht und was zu sehen war (ein Screenshot hilft). Vor einem Pull Request bitte `bun run check && bun run e2e` laufen lassen.

---

<div align="center">

⭐ Gefällt Ihnen Sekretär? Ein [Stern auf GitHub](https://github.com/firsttris/sekretaer) hilft anderen, es zu finden.<br>
🐛 [Fehler melden](https://github.com/firsttris/sekretaer/issues/new) · 💡 [Funktion vorschlagen](https://github.com/firsttris/sekretaer/issues/new)

<sub>Lizenz: <a href="LICENSE">AGPL-3.0</a> · © Tristan Teufel und Mitwirkende<br>
Geänderte Versionen, die Sie weitergeben oder für andere betreiben, müssen ihren Quellcode unter der AGPL anbieten; eine kommerzielle Lizenz ohne diese Pflichten gibt es über <a href="https://teufel-it.de">teufel-it.de</a>.<br>
Sekretär ist nicht mit Stalwart Labs, Google oder Microsoft verbunden.</sub>

</div>
