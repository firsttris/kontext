---
description: >-
  Kontext: Mail, Kalender, Kontakte, Aufgaben, Team-Chat und Telefonie (CTI) auf dem eigenen
  Server – eine selbst gehostete Alternative zu Google Workspace und Microsoft 365 für kleine
  Betriebe, mit Stalwart als Mailserver. DSGVO, Open Source (AGPL).
---

# Kontext – Mail, Kalender, Chat und Telefonie auf dem eigenen Server

Kontext ist **Mail, Kalender und Kontakte, die dir gehören** – wie Google Workspace oder
Microsoft 365, nur auf dem eigenen Server: gemeinsame Postfächer wie info@, ein Kalender fürs Team,
Kontakte, die zu jedem Kunden Mails, Termine und Aufgaben zeigen, dazu Team-Chat mit Videocalls und
das Firmentelefon an der Fritzbox. Für Freelancer, Handwerk, Kanzleien, Praxen und den
Mittelstand.

Jede Installation hat ihren eigenen Mailserver [Stalwart](https://stalw.art); Kontext ist die
Oberfläche im Browser und am Handy (installierbar als App) und spricht mit Stalwart über JMAP.
Die Daten bleiben auf dem eigenen Server – DSGVO, nichts geht beim Austritt verloren, keine Kosten pro
Benutzer. Thunderbird, Outlook, iPhone und Android verbinden sich weiter per IMAP, SMTP, CalDAV und
CardDAV.

Einen Rundgang in Bildern, gemacht zum Weiterschicken an Kunden und Kollegen, gibt es unter
[Kontext entdecken](entdecken.md).

![Kontext im Browser: Posteingang mit gemeinsamen Postfächern info@ und rechnung@, Kategorien und geöffneter Mail](screenshots/mail.png)

## Was drin ist

| | |
| --- | --- |
| [**Mail**](mail.md) | gemeinsame Postfächer, alle Posteingänge in einer Liste, Kategorien und Regeln fürs Team, Suche wie in Gmail, Wiedervorlage, später senden, Textbausteine, Gmail und GMX abrufen und als diese Adresse senden, Warnung vor gefälschten Absendern |
| [**Kalender und Kontakte**](calendar-contacts.md) | Tag, Woche, Monat, Serien, Einladungen, Verfügbarkeit der Kollegen wie in Outlook, Videobesprechung am Termin; Kunden-Ansicht mit letzten Mails und Terminen, Gruppen, vCard, geteilte Adressbücher |
| [**Aufgaben**](tasks.md) | Liste und Kanban-Board pro Postfach, aus Mails, Chat und Regeln, wiederkehrend, Erinnerungen als Push, CalDAV für Thunderbird und Handy |
| [**Team-Chat und Videocalls**](chat.md) | Kanäle pro gemeinsamem Postfach, Direktnachrichten, Threads, Mails als Karten, Anrufe, Videocalls und Bildschirm teilen über LiveKit |
| [**Telefonie (CTI)**](telephony.md) | Fritzbox-Anrufe klingeln in Kontext mit Kontakt, letzter Mail und nächstem Termin; Softphone im Browser, Mailbox als Mail, Öffnungszeiten, Weitervermitteln, Snom-Tischtelefone, Fax als PDF |
| [**Dokumente**](documents.md) | Word, Excel, PowerPoint und PDF im Browser (Schreibzeug), ein Ordner pro gemeinsamem Postfach, Anhänge ablegen und anhängen |
| [**Verschlüsselung**](encryption.md) | OpenPGP und S/MIME im Browser, „Vertraulich senden“ an jeden Empfänger, Ende-zu-Ende verschlüsselter Chat |
| [**KI-Agenten (MCP)**](agents.md) | Claude & Co. schlagen Kunden, Mails, Termine und Aufgaben nach und legen Entwürfe an – nie selbst senden oder löschen |
| [**Firmenverwaltung und Umzug**](company.md) | Mitarbeiter, gemeinsame Postfächer mit Rechten, Abwesenheit mit Vertretung, Austritt, Umzug von Microsoft 365, Gmail, Outlook (PST) |
| [**App, Handy und Konto**](app.md) | als App installierbar am PC, unter Android und am iPhone; Benachrichtigungen auch bei geschlossener App; am Handy jede Ansicht als eigener Bildschirm mit Tab-Leiste (welche Apps darin stehen, wählt man selbst); hell und dunkel, Anmeldung mit Code |

## Betrieb

Ein Server pro Firma: ein kleiner VPS (etwa bei IONOS oder Hetzner, ab rund 5 € im Monat) oder
ein Rechner im eigenen Haus, mit Docker oder Podman. Kontext, Stalwart und Caddy starten mit einer
Docker-Compose-Datei; Anrufe (LiveKit), Telefonie und Dokumente schaltet man dazu, wenn man sie
braucht. Backups gehen verschlüsselt mit Restic auf S3 mit Object Lock.
→ [Installation](installation.md)

## Wie es weitergeht

Was als Nächstes kommt und welche Punkte noch offen sind, steht in der
[Roadmap](https://github.com/firsttris/kontext/blob/main/ROADMAP.md); was sich in jeder Version
geändert hat, im [Changelog](https://github.com/firsttris/kontext/blob/main/CHANGELOG.md).

Weiter: [Installation](installation.md) · [Architektur](architecture.md) · [Entwicklung](development.md)
