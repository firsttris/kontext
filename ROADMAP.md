# Roadmap

Was als Nächstes in Kontext kommt, sortiert nach Nutzen für kleine Betriebe. Die Reihenfolge ist
ein Plan, kein Versprechen; Wünsche und Hinweise gern als
[Issue](https://github.com/firsttris/kontext/issues). Was schon fertig ist, steht im
[Changelog](CHANGELOG.md) und in der [Dokumentation](https://firsttris.github.io/kontext/).

## Als Nächstes

| Funktion | Worum es geht |
| --- | --- |
| **Pilot** | Vier Wochen bei einem Kunden parallel zum alten System, mit der [Telefonie](https://firsttris.github.io/kontext/telephony.html) im Test. |
| **Offene Punkte** | die Lücke unten: S/MIME-Zertifikate aus LDAP-Verzeichnissen. |

## Danach

| Funktion | Worum es geht |
| --- | --- |
| **Telefonie: mehr** | Anschluss direkt beim Anbieter oder per SIP-Trunk statt über die Fritzbox, SIP über TLS, Warteschleife mit Position, weitere Tischtelefone (Yealink, Grandstream). |
| **Module für Kunden** | Was nur manche Betriebe brauchen, kommt als eigenes Projekt wie [Schreibzeug](https://github.com/firsttris/schreibzeug) (Dokumente): eigener Dienst mit eigenen Daten und Releases, im Rahmen in Kontext eingebunden, Anmelden mit Kontext (OpenID Connect), je Kunde zuschaltbar. Ideen: **Arbeitsberichte** (etwa fürs Handwerk, mit Fotos von der Baustelle), **Belege**, **Team-Wissen** (Seiten pro Postfach: Abläufe, Zugänge, Preise), **Tickets**. |

## Mit Stalwart 1.0

Was Stalwart 1.0 neu mitbringt und Kontext nutzen kann; Kontext läuft seit
[#140](https://github.com/firsttris/kontext/pull/140) auf 1.0. Sortiert nach Mehrwert: oben, was
am meisten bringt. Fertig sind schon „Mails zuweisen“, „Suche in Anhängen“, „Ausgeblendete Kalender auf allen
Geräten“ und die „Übersicht der Zugänge“ (im [Changelog](CHANGELOG.md)).

| # | Funktion | Mehrwert | Umsetzung |
| --- | --- | --- | --- |
| 1 | **Mailprogramme ohne App-Passwort** | Mit Zwei-Faktor-Anmeldung bräuchten Apple Mail und Thunderbird kein App-Passwort mehr. | Stalwart 1.0 setzt das OAuth-Profil für Mailprogramme vollständig um. Dafür müsste die OAuth-Erkennung unter `/.well-known` zu Stalwart statt zu Kontext (Caddy) und Stalwarts Anmeldeseite öffentlich erreichbar sein – eine Frage der Architektur, erst nach dem Pilot. |

Nicht für Kontext: Volltextsuche in Dateien (betrifft Stalwarts eigenen Dateispeicher; Kontexts
Dokumente liegen in Schreibzeug), der KI-Spamfilter und das Wiederherstellen gelöschter Mails
(beides nur in der Enterprise-Edition).

## Für den Alltag

Kleinere und mittlere Funktionen, sortiert nach Nutzen: oben, was fast jedem Betrieb täglich hilft.

**Kleinerer Nutzen**

| # | Funktion | Worum es geht |
| --- | --- | --- |
| 29 | **Gelöschte Mails zurückholen** | Endgültig gelöschte Mails eine Zeit lang wiederherstellen; Stalwart bietet das nur in der Enterprise-Edition, Kontext bräuchte einen eigenen Weg. |

## Offene Punkte

Lücken und Befunde, die beim Bauen offen geblieben sind und noch angegangen werden.

**Funktionen**

- [ ] **S/MIME:** Zertifikate von Empfängern im LDAP-Verzeichnis ihrer Stelle suchen (bewusst
  offen, Gründe in der
  [Verschlüsselung](https://firsttris.github.io/kontext/encryption.html#grenzen-und-offene-punkte)).

## Bekannte Einschränkungen

- **Kategorien aus Outlook-Dateien (PST):** `readpst` gibt Kategorien nur für Kontakte und
  Termine aus, nicht für Mails. Aus Microsoft 365 und per IMAP kommen sie mit.
- **Regeln auf vorhandene Mails:** wirken auf die neuesten 1.000 Mails im Posteingang.
- **Regeln und Umlaute:** Stalwart vergleicht Groß- und Kleinschreibung nur bei ASCII; „MÜLLER“
  trifft dort nicht „Müller“.
- **Drucken:** Eingebettete Bilder werden mitgedruckt, Bilder aus dem Internet nur, wenn sie in der
  Mail geladen sind; Anhänge erscheinen nur mit Name und Größe.
- **Fotos im vertraulichen Chat** bekommen kein Vorschaubild: Der Server kann sie nicht lesen, sie
  laden in voller Größe.
- **Kategorien in Handy-Apps:** Apple Mail und die Gmail-App zeigen eigene Schlagworte nicht;
  sichtbar sind sie in Kontext und Thunderbird.
