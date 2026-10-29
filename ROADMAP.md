# Roadmap

Was als Nächstes in Kontext kommt, sortiert nach Nutzen für kleine Betriebe. Die Reihenfolge ist
ein Plan, kein Versprechen; Wünsche und Hinweise gern als
[Issue](https://github.com/firsttris/kontext/issues). Was schon fertig ist, steht im
[Changelog](CHANGELOG.md) und in der [Dokumentation](https://firsttris.github.io/kontext/).

## Als Nächstes

| Funktion | Worum es geht |
| --- | --- |
| **Pilot** | Vier Wochen bei einem Kunden parallel zum alten System, mit der [Telefonie](https://firsttris.github.io/kontext/telephony.html) im Test. |
| **Offene Punkte** | die Lücken unten, etwa App-Passwörter für CalDAV. |

## Danach

| Funktion | Worum es geht |
| --- | --- |
| **Telefonie: mehr** | Anschluss direkt beim Anbieter oder per SIP-Trunk statt über die Fritzbox, SIP über TLS, Warteschleife mit Position, weitere Tischtelefone (Yealink, Grandstream). |
| **Module für Kunden** | Was nur manche Betriebe brauchen, kommt als eigenes Projekt wie [Schreibzeug](https://github.com/firsttris/schreibzeug) (Dokumente): eigener Dienst mit eigenen Daten und Releases, im Rahmen in Kontext eingebunden, Anmelden mit Kontext (OpenID Connect), je Kunde zuschaltbar. Ideen: **Arbeitsberichte** (etwa fürs Handwerk, mit Fotos von der Baustelle), **Belege**, **Team-Wissen** (Seiten pro Postfach: Abläufe, Zugänge, Preise), **Tickets**. |

## Für den Alltag

Kleinere und mittlere Funktionen, sortiert nach Nutzen: oben, was fast jedem Betrieb täglich hilft.

**Großer Nutzen**

| # | Funktion | Worum es geht |
| --- | --- | --- |
| 6 | **Mails zuweisen** | In info@ eine Mail einer Person zuweisen und als erledigt markieren, Filter „Mir zugewiesen“ und „Offen“. |

**Spürbarer Nutzen**

| # | Funktion | Worum es geht |
| --- | --- | --- |
| 13 | **Hinweis „Extern“** | Mails von außerhalb der Firma tragen ein Kennzeichen; vor dem Senden oder Einladen an Externe fragt Kontext nach. Partnerdomains zählen als intern; je Firma einschaltbar. |

**Kleinerer Nutzen**

| # | Funktion | Worum es geht |
| --- | --- | --- |
| 29 | **Gelöschte Mails zurückholen** | Endgültig gelöschte Mails eine Zeit lang wiederherstellen; Stalwart bietet das nur in der Enterprise-Edition, Kontext bräuchte einen eigenen Weg. |

## Offene Punkte

Lücken und Befunde, die beim Bauen offen geblieben sind und noch angegangen werden.

**Funktionen**

- [ ] Chat: Vorschaubilder für Fotos von vor diesem Stand fehlen (sie laden weiter in voller Größe); neue bekommen eins beim Hochladen.
- [ ] Chat: Reaktionen mit beliebigen Emojis (heute die sieben Schnellwahlen), und im Thread „auch im Kanal zeigen“.
- [ ] Aufgaben am Kontakt finden Mails nur über die letzten fünf Mails mit der Person im eigenen Postfach; ältere oder solche in info@ zählen nur, wenn die Aufgabe mit der Karte verknüpft ist (geschieht beim Anlegen aus der Mail). Die Verknüpfung „Termin“ wird noch nirgends angelegt.
- [ ] Erinnerung an Aufgaben auch direkt im Dialog „Neue Aufgabe“ (heute in der geöffneten Aufgabe).
- [ ] S/MIME: eigene anerkannte Stellen in der Firmenverwaltung pflegen (heute `SMIME_ROOTS`); Sperrlisten (CRL), wo eine Stelle kein OCSP anbietet; LDAP-Verzeichnisse einzelner Stellen; Unterschriften mit EC-Schlüsseln prüfen (heute „nicht prüfbar“).
- [ ] Anhänge verschlüsselter Mails ohne Umweg über Stalwart: heute liegen sie bis zum Senden unverschlüsselt in dessen Zwischenspeicher (siehe [Verschlüsselung](https://firsttris.github.io/kontext/encryption.html#grenzen-und-offene-punkte)).
- [ ] CalDAV für Aufgaben mit Bestätigung in zwei Schritten: App-Passwörter anlegen können (Thunderbird und Handy fragen keinen Code ab); dazu `sync-collection` für schnelleren Abgleich auf dem iPhone.
- [ ] **Regeln für Mitarbeiter** in der Firmenverwaltung (heute nur für gemeinsame Postfächer und die eigenen).
- [ ] **Weitere Sprachen** neben Deutsch und Englisch (Texte in `messages/*.json`).
- [ ] Wiedervorlage für mehrere ausgewählte Mails auf einmal (heute aus der geöffneten Mail) und „Wieder vorgelegt“ auch in „Alle Posteingänge“ (heute im Posteingang des Postfachs).
- [ ] Lesebestätigungen von Programmen, die kein `In-Reply-To` setzen, erkennt die gesendete Mail noch nicht (dazu müsste Kontext `Original-Message-ID` im Bericht lesen); eingegangene Bestätigungen könnten von selbst gelesen und still abgelegt werden.
- [ ] **Drucken mit Bildern aus dem Internet**, wenn sie in der Mail freigegeben wurden.

**Technik**

- [ ] e2e: einige lesende Tests öffnen Mails aus den Testdaten. Legen andere Tests viele Mails in Jonas' Posteingang, rutschen diese aus dem sichtbaren Bereich der Liste (sie zeigt nur, was auf dem Bildschirm ist); nach und nach auf eigene Mails umstellen (der Handy-Test ist umgestellt).
- [ ] Lokal fehlt `readpst` für den Outlook-Test (`sudo apt install pst-utils`).
- [ ] README: ein Bild der Regeln; Aufgaben und Chat sind drin (Beispieldaten über die API, `e2e/demo-data.ts`). In der lokalen Entwicklung sind Aufgaben und Chat weiterhin leer.

## Bekannte Einschränkungen

- **Kategorien aus Outlook-Dateien (PST):** `readpst` gibt Kategorien nur für Kontakte und
  Termine aus, nicht für Mails. Aus Microsoft 365 und per IMAP kommen sie mit.
- **Regeln auf vorhandene Mails:** wirken auf die neuesten 1.000 Mails im Posteingang.
- **Regeln und Umlaute:** Stalwart vergleicht Groß- und Kleinschreibung nur bei ASCII; „MÜLLER“
  trifft dort nicht „Müller“.
- **Drucken:** Bilder aus dem Internet und die Anhänge selbst werden nicht mitgedruckt, nur ihre
  Namen.
- **Kategorien in Handy-Apps:** Apple Mail und die Gmail-App zeigen eigene Schlagworte nicht;
  sichtbar sind sie in Kontext und Thunderbird.
