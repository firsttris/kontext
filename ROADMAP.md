# Roadmap

Was als Nächstes in Kontext kommt, sortiert nach Nutzen für kleine Betriebe. Die Reihenfolge ist
ein Plan, kein Versprechen; Wünsche und Hinweise gern als
[Issue](https://github.com/firsttris/kontext/issues).

## Als Nächstes

| Funktion | Worum es geht |
| --- | --- |
| **Verschlüsselung** | Das [Konzept](docs/encryption.md) in fünf Bausteinen; alle fertig: Grundschutz, persönlicher Schlüssel, PGP in Mails, S/MIME, „Vertraulich senden“ mit Link und vertrauliche Unterhaltungen im Chat. |

## Danach

| Funktion | Worum es geht |
| --- | --- |
| **Telefonie** | Eine Firmennummer, die in Kontext klingelt: Festnetz und Handy über einen SIP-Anbieter (LiveKit SIP), Gruppenruf, Weiterleitung, Mailbox. |

## Offene Punkte

Kleinere Dinge, die beim Bauen aufgefallen sind und noch erledigt werden.

**Funktionen**

- [ ] Erinnerungen an Termine auch bei geschlossener App (heute nur, solange Kontext offen ist): der Server müsste die Kalender beobachten wie die Posteingänge.
- [ ] Chat: Vorschaubilder für Fotos von vor diesem Stand fehlen (sie laden weiter in voller Größe); neue bekommen eins beim Hochladen.
- [ ] Chat: Reaktionen mit beliebigen Emojis (heute die sieben Schnellwahlen), und im Thread „auch im Kanal zeigen“.
- [ ] Aufgaben am Kontakt finden Mails nur über die letzten fünf Mails mit der Person im eigenen Postfach; ältere oder solche in info@ zählen nur, wenn die Aufgabe mit der Karte verknüpft ist (geschieht beim Anlegen aus der Mail). Die Verknüpfung „Termin“ wird noch nirgends angelegt.
- [ ] Erinnerung an Aufgaben auch direkt im Dialog „Neue Aufgabe“ (heute in der geöffneten Aufgabe).
- [ ] PGP: nur unterschreiben (ohne Verschlüsseln) beim Senden.
- [ ] Vertraulicher Chat: ein bestehender Kanal nachträglich vertraulich, Schlüsselwechsel eines Mitglieds anzeigen.
- [ ] S/MIME: Zertifikatsketten gegen eine Liste anerkannter Stellen prüfen und Sperrlisten (OCSP) abfragen (heute zeigt Kontext die ausstellende Stelle); Zertifikate anderer im Verzeichnis der Stelle suchen; nur unterschreiben beim Senden.
- [ ] CalDAV für Aufgaben mit Bestätigung in zwei Schritten: App-Passwörter anlegen können (Thunderbird und Handy fragen keinen Code ab); dazu `sync-collection` für schnelleren Abgleich auf dem iPhone.
- [ ] **Regeln für Mitarbeiter** in der Firmenverwaltung (heute nur für gemeinsame Postfächer und die eigenen).
- [ ] **App auf Englisch** und weiteren Sprachen (Texte liegen schon gesammelt in `messages/de.json`).
- [ ] Wiedervorlage für mehrere ausgewählte Mails auf einmal (heute aus der geöffneten Mail) und „Wieder vorgelegt“ auch in „Alle Posteingänge“ (heute im Posteingang des Postfachs).
- [ ] Lesebestätigungen von Programmen, die kein `In-Reply-To` setzen, erkennt die gesendete Mail noch nicht (dazu müsste Kontext `Original-Message-ID` im Bericht lesen); eingegangene Bestätigungen könnten von selbst gelesen und still abgelegt werden.
- [ ] **Drucken mit Bildern aus dem Internet**, wenn sie in der Mail freigegeben wurden.
- [ ] Ideen aus dem ersten Entwurf, noch nicht eingeplant: **Belege**, **Buchung**, **Leitstand**, **Tickets**.

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

## Zuletzt fertig geworden

Verschlüsselte Mails: nach dem Öffnen mit Text in Liste und Unterhaltung, Antworten zitieren ihn, Weiterleiten mit Inhalt und Anhängen.
„Vertraulich senden“: Laufzeit des Links beim Senden wählbar (7, 30 oder 90 Tage).
Anrufe und Videocalls in vertraulichen Unterhaltungen gehen Ende-zu-Ende verschlüsselt (LiveKit E2EE, Schlüssel je Anruf an die Mitglieder verschlüsselt).
Verschlüsselte Mails (PGP und S/MIME) verschlüsseln auch den Betreff; außen steht „Vertrauliche Nachricht“, nach dem Öffnen der echte.
Vertraulicher Chat: Fotos und Dateien gehen Ende-zu-Ende verschlüsselt, ohne lesbaren Namen auf dem Server.
Verschlüsselung, Baustein 5: vertrauliche Direktnachrichten und Kanäle im Chat, Ende-zu-Ende
verschlüsselt mit den persönlichen Schlüsseln, unterschrieben; der Server sieht nur Verschlüsseltes.
Verschlüsselung, S/MIME: eigenes Zertifikat (.p12) importieren, Zertifikate anderer aus
unterschriebenen Mails und Dateien, S/MIME-Mails lesen und Unterschriften prüfen, „Vertraulich
senden“ nimmt S/MIME für Empfänger mit Zertifikat.
Verschlüsselung, Baustein 4: „Vertraulich senden“ – PGP für Empfänger mit Schlüssel, für alle
anderen ein Link mit Code auf den eigenen Server (Schlüssel nur im Link), Antworten dort, Übersicht
„Vertraulich gesendet“.
Verschlüsselung, Baustein 3: PGP-Mails lesen (entschlüsseln im Browser, Unterschrift prüfen) und
verschlüsselt und unterschrieben senden, mit Anhängen; Antworten darauf gehen verschlüsselt.
Verschlüsselung, Baustein 2: persönlicher OpenPGP-Schlüssel (anlegen, importieren, mit Passphrase
und Wiederherstellungscode), Schlüssel anderer aus Autocrypt, WKD, keys.openpgp.org und Dateien, WKD
für die eigenen Leute.
Verschlüsselung, Baustein 1: Schloss an Mails (verschlüsselt angekommen?), Prüfung von SPF,
DMARC, MTA-STS, TLS-RPT, DANE und HTTPS in der Firmenverwaltung, Anleitung für Platte und Backups.
Lesebestätigung anfordern, beantworten und sehen.
Newsletter abbestellen mit einem Klick, per Mail oder auf der Webseite des Absenders. Bilder je
Absender, Domain oder für alle Kontakte erlauben.
Aufgaben: eigene Spalten pro Board, wiederkehrende Aufgaben, Regel-Aktion „Aufgabe anlegen“,
Abgleich mit Thunderbird und Handy-Apps über CalDAV.
Team-Chat: Antworten im Thread, Reaktionen, Aufbewahrungsfrist in der Firmenverwaltung, Suche
mit Umlauten, Vorschaubilder für Fotos, Mail als Kopie teilen.
Aufgaben überall im Kontext: offene Aufgaben am Kontakt, Fälliges im Kalender, neu Zugewiesenes
und heute Fälliges in der Glocke, Erinnerungen als Benachrichtigung auch bei geschlossener App,
„Aufgaben erstellen“ für mehrere Mails.
Wiedervorlage (eine Mail bis zu einem Zeitpunkt aus dem Weg, dann oben im Posteingang – auch bei
geschlossener App).
Anrufe und Videobesprechungen im Chat (LiveKit auf dem eigenen Server): anrufen in
Direktnachrichten, mit Klingeln auch bei geschlossener App, Besprechungen in Kanälen zum
Beitreten, Bildschirm teilen, das Gespräch bleibt beim Wechsel zwischen den Apps offen;
„Verpasster Anruf“ und Gesprächsdauer im Verlauf; Videobesprechung am Termin mit Gästen per Link.
Senden rückgängig und später senden, Textbausteine.
Unterhaltungen beim Lesen (frühere Mails, Antworten seitdem, Zitate eingeklappt, „wer hat
geantwortet“ in gemeinsamen Postfächern), auf Wunsch gruppiert.
Benachrichtigungen bei geschlossener App (Web Push, Ende-zu-Ende verschlüsselt) für neue Mails,
Direktnachrichten und @Erwähnungen.
Team-Chat mit Kanälen (#allgemein, einer pro gemeinsamem Postfach, eigene), Direktnachrichten,
@Erwähnungen, „schreibt …“, Gelesen und Ungelesen, Fotos und Dateien, Mails, Aufgaben und
Kontakte als Karten, „Über diese Mail sprechen“, Aufgaben aus Nachrichten, Suche, Bearbeiten,
Löschen und Stummschalten – live über eine
eigene Verbindung, die auch Aufgaben sofort abgleicht; am Handy eine Tab-Leiste mit Chat und „Mehr“.
Aufgaben mit Liste und Kanban-Board (eigene und pro gemeinsamem Postfach, aus Mails heraus, mit
Checkliste, Zuständigen und Fälligkeit), Kontext als installierbare App (PWA),
Regeln (auch für gemeinsame Postfächer und auf vorhandene Mails), Kategorien (im Team geteilt,
per Regel gesetzt, beim Umzug übernommen), mehrere Mails auf einmal bearbeiten, Drucken,
Benachrichtigungen, Speicherplatz, Warnungen vor gefälschten Absendern, Anhänge mit Vorschau,
Mails zwischen Postfächern verschieben. Alles Weitere steht in der
[Dokumentation](https://firsttris.github.io/kontext/).
