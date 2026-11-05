# Roadmap

Was als Nächstes in Kontext kommt, sortiert nach Nutzen für kleine Betriebe. Die Reihenfolge ist
ein Plan, kein Versprechen; Wünsche und Hinweise gern als
[Issue](https://github.com/firsttris/kontext/issues). Was schon fertig ist, steht im
[Changelog](CHANGELOG.md) und in der [Dokumentation](https://firsttris.github.io/kontext/).

## Als Nächstes

Sortiert nach Nutzen: oben, was am meisten bringt.

| # | Funktion | Worum es geht |
| --- | --- | --- |
| 1 | **Pilot** | Vier Wochen bei einem Kunden parallel zum alten System, mit der [Telefonie](https://firsttris.github.io/kontext/telephony.html) im Test. |
| 2 | **Mails verschlüsselt auf dem Server ablegen** | Seit Stalwart 1.0.2 kann jedes Postfach einen öffentlichen Schlüssel (OpenPGP oder S/MIME) bekommen; Stalwart legt neue Mails dann nur verschlüsselt ab, auf Wunsch mit verborgenem Betreff und auch Gesendetes und Entwürfe (`AccountSettings.encryptionAtRest`). Wer Platte oder Backup in die Hände bekommt, liest nichts – ein starkes Argument für Kanzleien und Praxen. Kontext entschlüsselt OpenPGP und S/MIME schon im Browser; fehlt der Schalter unter *Einstellungen → Verschlüsselung*. Die Oberfläche muss sagen, was dann nicht mehr geht: Volltextsuche, Regeln, Assistent und Agenten sehen in diese Mails nicht hinein. |
| 3 | **Einladungen im Namen von info@** | Aus einem gemeinsamen Kalender als das Postfach einladen statt als man selbst (JMAP `ParticipantIdentity`). |
| 4 | **Speicher auf dem Server verschlüsseln und komprimieren** | Seit Stalwart 1.0.3 verschlüsselt Stalwart gespeicherte Daten mit einem Server-Schlüssel (`SymmetricKey`, AES-256-GCM) und komprimiert sie mit Zstandard; `BlobRecode` schreibt Vorhandenes um. Schützt Platte und Backup, nicht vor dem Admin. Der Einrichtungsbefehl schaltet es ein, die [Installation](https://firsttris.github.io/kontext/installation.html) erklärt es. |

## Zu entscheiden

Fragen, die vor dem Bauen eine Antwort brauchen.

- **Assistent:** Fragt er nach, bevor er einen Entwurf, Termin, Kontakt oder eine Aufgabe anlegt?
- **Phishing melden aus info@:** Mit welcher Adresse geht die Meldung hinaus, der eigenen oder der
  des gemeinsamen Postfachs?
- **Google-Takeout-Import:** Spam und Papierkorb überspringen?
- **.ics-Export:** Erinnerungen mitnehmen? Bisher bleiben sie bewusst draußen.
- **Private Serien:** Stalwart hält „Privat“ pro Serie; wer es bei einem Termin einer Serie
  abwählt, macht die ganze Serie öffentlich. Vorher warnen?

## Danach

| # | Funktion | Worum es geht |
| --- | --- | --- |
| 5 | **Mails beim Versand automatisch verschlüsseln** | Stalwart 1.0.2 verschlüsselt ausgehende Mails selbst, wenn es den Schlüssel des Empfängers kennt (Web Key Directory, keys.openpgp.org, DNS oder aus eingehenden Mails gelernt), je Empfänger nie, wenn möglich oder Pflicht. In der Firmenverwaltung: ein Schalter und die Liste der Empfänger-Schlüssel, dazu bei Bedarf eigene S/MIME-Stammzertifikate. Größter Brocken: Diese Einstellungen (`Encryption`, `ExternalPublicKey`, `SmimeTrustAnchor`) darf nur der Superuser ändern, der Schlüssel des Einrichtungsbefehls bräuchte die Rechte dazu. |
| 6 | **Mailprogramme ohne App-Passwort** | Mit Zwei-Faktor-Anmeldung bräuchten Apple Mail und Thunderbird kein App-Passwort mehr. Stalwart 1.0 setzt das OAuth-Profil für Mailprogramme um; dafür müsste die OAuth-Erkennung unter `/.well-known` zu Stalwart statt zu Kontext (Caddy) und Stalwarts Anmeldeseite öffentlich erreichbar sein – eine Frage der Architektur, erst nach dem Pilot. |
| 7 | **Telefonie: mehr** | Anschluss direkt beim Anbieter oder per SIP-Trunk statt über die Fritzbox, SIP über TLS, Warteschleife mit Position, weitere Tischtelefone (Yealink, Grandstream). |
| 8 | **Module für Kunden** | Was nur manche Betriebe brauchen, kommt als eigenes Projekt wie [Schreibzeug](https://github.com/firsttris/schreibzeug) (Dokumente): eigener Dienst mit eigenen Daten und Releases, im Rahmen in Kontext eingebunden, Anmelden mit Kontext (OpenID Connect), je Kunde zuschaltbar. Ideen: **Arbeitsberichte** (etwa fürs Handwerk, mit Fotos von der Baustelle), **Belege**, **Team-Wissen** (Seiten pro Postfach: Abläufe, Zugänge, Preise), **Tickets**. |
| 9 | **Hinweise von Stalwart in der Glocke** | „Anna hat dir ihren Kalender freigegeben“, „Sandra hat den Termin verschoben“ (JMAP `ShareNotification`, `CalendarEventNotification`). |
| 10 | **Weitere Sprachen** | Nach Deutsch und Englisch weitere europäische Sprachen (Texte in `messages/`). |
| 11 | **Gelöschte Mails zurückholen** | Endgültig gelöschte Mails eine Zeit lang wiederherstellen. Stalwart bietet das nur in der Enterprise-Edition, Kontext bräuchte einen eigenen Weg; Rückgängig nach Archivieren, Löschen und Verschieben gibt es schon. |

Nicht für Kontext: Stalwarts eigener Dateispeicher (`FileNode`) und die Volltextsuche darin
(Kontexts Dokumente liegen in Schreibzeug), Stalwarts Push-Abos (Kontext hat seine eigene
Live-Verbindung und Push-Mitteilungen), der KI-Spamfilter (nur Enterprise-Edition) sowie DKIM2,
Telemetrie und Milter (reine Server-Einstellungen).

## Offene Punkte

Lücken und Befunde, die beim Bauen offen geblieben sind und noch angegangen werden.

**Funktionen**

- [ ] **S/MIME:** Zertifikate von Empfängern im LDAP-Verzeichnis ihrer Stelle suchen (bewusst
  offen, Gründe in der
  [Verschlüsselung](https://firsttris.github.io/kontext/encryption.html#grenzen-und-offene-punkte)).
- [ ] **ZIP „Alle herunterladen“:** Die Prüfsumme (CRC-32) rechnet bei großen Anhängen langsam
  (etwa 1,6 s je 50 MB) und hält dabei die Oberfläche an.
- [ ] **Kalendername:** Das Feld nimmt 255 Zeichen, Stalwart 255 Byte; ein langer Name mit
  Umlauten wird abgelehnt (die Meldung steht im Dialog).
- [ ] **Kontakt verschieben:** Wer einen Kontakt aus dem offenen Adressbuch verschiebt, sieht
  danach „kein Kontakt“, statt dem Kontakt ins neue Buch zu folgen.
- [ ] **Entwurf wieder öffnen:** Bilder aus dem Internet, die in der Antwort geladen waren,
  fallen weg, weil ein Entwurf immer mit gesperrten Bildern öffnet.

**Dokumentation**

- [ ] **Screenshots auf Englisch** für das englische README und die englische Dokumentation;
  bisher zeigen alle Bilder die deutsche Oberfläche.

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
