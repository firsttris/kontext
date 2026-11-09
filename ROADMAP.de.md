# Roadmap

Die Funktionen, die als Nächstes in Kontext kommen, sortiert nach Nutzen: oben, was am meisten
bringt. Die Reihenfolge ist ein Plan, kein Versprechen; Wünsche gern als
[Issue](https://github.com/firsttris/kontext/issues). Was schon fertig ist, steht im
[Changelog](CHANGELOG.md) und in der [Dokumentation](https://kontext.email/). In English: [ROADMAP.md](ROADMAP.md).

## Neu in Stalwart

Was Stalwart 1.0.2 und 1.0.3 mitbringen und Kontext noch nicht nutzt.

| # | Funktion | Worum es geht |
| --- | --- | --- |
| 1 | **Mailprogramme ohne App-Passwort** | Mit Zwei-Faktor-Anmeldung brauchen Apple Mail und Thunderbird kein App-Passwort mehr: Stalwart 1.0 setzt das OAuth-Profil für Mailprogramme um. Dafür muss die OAuth-Erkennung unter `/.well-known` zu Stalwart statt zu Kontext (Caddy) und Stalwarts Anmeldeseite öffentlich erreichbar sein. |

## Weitere Funktionen

| # | Funktion | Worum es geht |
| --- | --- | --- |
| 2 | **Telefonbox als eigene Telefonanlage (SIP-Trunk)** | Die Telefonbox meldet sich per SIP-Trunk direkt beim Anbieter an (etwa Telekom, sipgate, easybell), statt sich als IP-Telefon an der Fritzbox anzumelden. Damit wird sie selbst die Telefonanlage, wie 3CX oder Placetel, aber in Kontext und ohne Lizenz pro Nebenstelle: Rufnummern, Durchwahlen, Weiterleitungen und Tischtelefone hängen an Kontext, die Fritzbox ist nur noch Router oder entfällt. Dazu SIP über TLS, eine Warteschleife mit Position und weitere Tischtelefone (Yealink, Grandstream). Die Fritzbox bleibt als einfacher Weg für Betriebe, die sie behalten wollen. |
| 3 | **Weitere Sprachen** | Nach Deutsch und Englisch weitere europäische Sprachen. |

## Weitere Ideen

Noch nicht eingeplant; was davon kommt, entscheidet sich später.

| Idee | Worum es geht |
| --- | --- |
| **Online-Terminbuchung** | Eine Buchungsseite für Kunden mit den freien Zeiten aus dem Kalender; der gebuchte Termin landet direkt im Kalender, mit Bestätigung per Mail. Für Praxen, Kanzleien und Handwerk; „Wer hat Zeit?“ und die Gast-Links für Videobesprechungen sind schon da. |
| **Räume, Firmenwagen und Geräte buchen** | Buchbare Ressourcen mit eigenem Kalender, die man zum Termin einlädt und die Doppelbuchungen ablehnen. Stalwart kennt nur Benutzer- und Gruppenkonten, eine Ressource wäre ein Gruppenkonto wie ein gemeinsames Postfach. |
| **GoBD-Mail-Archiv** | Geschäftsmails unveränderbar und jahrelang aufbewahren, wie es die deutschen Aufbewahrungsregeln verlangen; heute braucht es dafür ein Archiv daneben. Groß, eher als eigenes Modul wie [Schreibzeug](https://github.com/firsttris/schreibzeug). |
| **Serienmail an eine Kontaktgruppe** | Eine Mail an alle einer Gruppe, jede einzeln und persönlich mit Anrede, etwa für Betriebsurlaub oder neue Preise. |
