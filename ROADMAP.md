# Roadmap

Die Funktionen, die als Nächstes in Kontext kommen, sortiert nach Nutzen: oben, was am meisten
bringt. Die Reihenfolge ist ein Plan, kein Versprechen; Wünsche gern als
[Issue](https://github.com/firsttris/kontext/issues). Was schon fertig ist, steht im
[Changelog](CHANGELOG.md) und in der [Dokumentation](https://firsttris.github.io/kontext/).

## Neu in Stalwart

Was Stalwart 1.0.2 und 1.0.3 mitbringen und Kontext noch nicht nutzt.

| # | Funktion | Worum es geht |
| --- | --- | --- |
| 1 | **Mails verschlüsselt auf dem Server ablegen** | Jedes Postfach kann einen öffentlichen Schlüssel (OpenPGP oder S/MIME) bekommen; Stalwart legt neue Mails dann nur verschlüsselt ab, auf Wunsch mit verborgenem Betreff und auch Gesendetes und Entwürfe (`AccountSettings.encryptionAtRest`, seit 1.0.2). Wer Platte oder Backup in die Hände bekommt, liest nichts. Kontext entschlüsselt OpenPGP und S/MIME schon im Browser; es fehlt der Schalter unter *Einstellungen → Verschlüsselung*, mit dem Hinweis, dass Suche, Regeln, Assistent und Agenten in diese Mails nicht hineinsehen. |
| 2 | **Mails beim Versand automatisch verschlüsseln** | Stalwart verschlüsselt ausgehende Mails selbst, wenn es den Schlüssel des Empfängers kennt (Web Key Directory, keys.openpgp.org, DNS oder aus eingehenden Mails gelernt), je Empfänger nie, wenn möglich oder Pflicht (seit 1.0.2). In der Firmenverwaltung ein Schalter und die Liste der Empfänger-Schlüssel (`Encryption`, `ExternalPublicKey`, `SmimeTrustAnchor`); diese darf nur der Superuser ändern, der Schlüssel des Einrichtungsbefehls braucht dafür neue Rechte. |
| 3 | **Einladungen im Namen von info@** | Aus einem gemeinsamen Kalender als das Postfach einladen statt als man selbst (JMAP `ParticipantIdentity`). |
| 4 | **Hinweise von Stalwart in der Glocke** | „Anna hat dir ihren Kalender freigegeben“, „Sandra hat den Termin verschoben“ (JMAP `ShareNotification`, `CalendarEventNotification`). |
| 5 | **Speicher verschlüsseln und komprimieren** | Stalwart verschlüsselt gespeicherte Daten mit einem Server-Schlüssel (`SymmetricKey`, AES-256-GCM) und komprimiert sie mit Zstandard; `BlobRecode` schreibt Vorhandenes um (seit 1.0.3). Schützt Platte und Backup. Der Einrichtungsbefehl schaltet es ein. |
| 6 | **Mailprogramme ohne App-Passwort** | Mit Zwei-Faktor-Anmeldung brauchen Apple Mail und Thunderbird kein App-Passwort mehr: Stalwart 1.0 setzt das OAuth-Profil für Mailprogramme um. Dafür muss die OAuth-Erkennung unter `/.well-known` zu Stalwart statt zu Kontext (Caddy) und Stalwarts Anmeldeseite öffentlich erreichbar sein. |

## Weitere Funktionen

| # | Funktion | Worum es geht |
| --- | --- | --- |
| 7 | **Telefonie: mehr** | Anschluss direkt beim Anbieter oder per SIP-Trunk statt über die Fritzbox, SIP über TLS, Warteschleife mit Position, weitere Tischtelefone (Yealink, Grandstream). |
| 8 | **Weitere Sprachen** | Nach Deutsch und Englisch weitere europäische Sprachen. |

## Weitere Ideen

Noch nicht eingeplant; was davon kommt, entscheidet sich später.

| Idee | Worum es geht |
| --- | --- |
| **Online-Terminbuchung** | Eine Buchungsseite für Kunden mit den freien Zeiten aus dem Kalender; der gebuchte Termin landet direkt im Kalender, mit Bestätigung per Mail. Für Praxen, Kanzleien und Handwerk; „Wer hat Zeit?“ und die Gast-Links für Videobesprechungen sind schon da. |
| **Räume, Firmenwagen und Geräte buchen** | Buchbare Ressourcen mit eigenem Kalender, die man zum Termin einlädt und die Doppelbuchungen ablehnen. Stalwart kennt nur Benutzer- und Gruppenkonten, eine Ressource wäre ein Gruppenkonto wie ein gemeinsames Postfach. |
| **GoBD-Mail-Archiv** | Geschäftsmails unveränderbar und jahrelang aufbewahren, wie es die deutschen Aufbewahrungsregeln verlangen; heute braucht es dafür ein Archiv daneben. Groß, eher als eigenes Modul wie [Schreibzeug](https://github.com/firsttris/schreibzeug). |
| **Serienmail an eine Kontaktgruppe** | Eine Mail an alle einer Gruppe, jede einzeln und persönlich mit Anrede, etwa für Betriebsurlaub oder neue Preise. |
