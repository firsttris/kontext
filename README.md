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

<img src="docs/screenshots/mail.png" alt="Sekretär im Browser: Posteingang mit Ordnern, gemeinsamen Postfächern info@ und rechnung@ und einer geöffneten Mail mit PDF-Anhang" width="900">

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

- **Gemeinsame Postfächer**: info@ & Co. stehen bei jedem Mitglied in der Seitenleiste; Antworten gehen als info@ raus, mit dem Namen der Person, die geantwortet hat. Postfächer nur zum Lesen zeigen nur, was erlaubt ist.
- **Alle Posteingänge in einer Liste**: eigene Mails und die aus info@ & Co. zusammen, das gemeinsame Postfach als kleines Etikett.
- **Ordner und Unterordner**: anlegen, Mails verschieben, Archiv und Papierkorb mit einem Klick.
- **Schreiben mit Formatierung**: Fett, Listen, Einrücken, Links, Zitate – die Leiste ist immer sichtbar.
- **Antworten, allen antworten, weiterleiten**: mit Zitat, Anhängen und Vorschlägen aus den Kontakten.
- **Sicher lesen**: Mails laufen in einem abgeschotteten Rahmen, Bilder aus dem Internet erst auf Wunsch.
- **Sofort aktuell**: neue Mails und Änderungen von Kollegen erscheinen ohne Neuladen (JMAP Push).

### ⚙️ Einstellungen

- **Signatur pro Absender**: eigene Adresse und gemeinsame Postfächer, mit Formatierung.
- **Abwesenheitsnotiz**: mit Zeitraum, antwortet automatisch.
- **Passwort und Anmeldung mit Code** (Authenticator-App); man bleibt auf dem Gerät angemeldet.

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

Umzugswege für Gmail, Microsoft 365 und Outlook (lokal) sind geplant, sobald Mail, Kontakte und Kalender fertig ausgebaut sind. Bis dahin geht es mit IMAP-Sync-Werkzeugen wie imapsync.

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
bun run dev:stalwart -- --seed   # Stalwart 0.16 auf Port 18080 mit Testdaten (eigenes Terminal)
bun run dev:server               # Anmeldung und JMAP-Durchleitung auf Port 18090 (eigenes Terminal)
bun run dev                      # http://localhost:5173, Anmeldung jonas@weber-haustechnik.test
```

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
