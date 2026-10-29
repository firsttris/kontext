# Roadmap

Was als Nächstes in Kontext kommt, sortiert nach Nutzen für kleine Betriebe. Die Reihenfolge ist
ein Plan, kein Versprechen; Wünsche und Hinweise gern als
[Issue](https://github.com/firsttris/kontext/issues). Was schon fertig ist, steht im
[Changelog](CHANGELOG.md) und in der [Dokumentation](https://firsttris.github.io/kontext/).

## Als Nächstes

| Funktion | Worum es geht |
| --- | --- |
| **Pilot** | Vier Wochen bei einem Kunden parallel zum alten System, mit der [Telefonie](https://firsttris.github.io/kontext/telephony.html) im Test. |
| **Offene Punkte** | die Lücken unten, etwa beliebige Emojis im Chat. |

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

**Kleinerer Nutzen**

| # | Funktion | Worum es geht |
| --- | --- | --- |
| 29 | **Gelöschte Mails zurückholen** | Endgültig gelöschte Mails eine Zeit lang wiederherstellen; Stalwart bietet das nur in der Enterprise-Edition, Kontext bräuchte einen eigenen Weg. |

## Offene Punkte

Lücken und Befunde, die beim Bauen offen geblieben sind und noch angegangen werden.

**Funktionen**

- [ ] **Drucken mit freigegebenen Bildern:** Bilder aus dem Internet, die in der Mail geladen
  wurden, auch mitdrucken.
- [ ] **Chat:** Reaktionen mit beliebigen Emojis (heute die sieben Schnellwahlen), und im Thread
  „auch im Kanal zeigen“.
- [ ] **README und lokale Entwicklung:** ein Bild der Regeln im README; Aufgaben und Chat mit
  Beispieldaten auch in der lokalen Entwicklung (heute nur über die API für die Bilder,
  `e2e/demo-data.ts`).
- [ ] **S/MIME:** eigene anerkannte Stellen in der Firmenverwaltung pflegen (heute
  `SMIME_ROOTS`); Sperrlisten (CRL), wo eine Stelle kein OCSP anbietet; LDAP-Verzeichnisse
  einzelner Stellen; Unterschriften mit EC-Schlüsseln prüfen (heute „nicht prüfbar“).

## Bekannte Einschränkungen

- **Kategorien aus Outlook-Dateien (PST):** `readpst` gibt Kategorien nur für Kontakte und
  Termine aus, nicht für Mails. Aus Microsoft 365 und per IMAP kommen sie mit.
- **Regeln auf vorhandene Mails:** wirken auf die neuesten 1.000 Mails im Posteingang.
- **Regeln und Umlaute:** Stalwart vergleicht Groß- und Kleinschreibung nur bei ASCII; „MÜLLER“
  trifft dort nicht „Müller“.
- **Drucken:** Eingebettete Bilder werden mitgedruckt, Bilder aus dem Internet nicht; Anhänge
  erscheinen nur mit Name und Größe.
- **Fotos im vertraulichen Chat** bekommen kein Vorschaubild: Der Server kann sie nicht lesen, sie
  laden in voller Größe.
- **Kategorien in Handy-Apps:** Apple Mail und die Gmail-App zeigen eigene Schlagworte nicht;
  sichtbar sind sie in Kontext und Thunderbird.
