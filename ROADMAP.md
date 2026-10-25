# Roadmap

Was als Nächstes in Kontext kommt, sortiert nach Nutzen für kleine Betriebe. Die Reihenfolge ist
ein Plan, kein Versprechen; Wünsche und Hinweise gern als
[Issue](https://github.com/firsttris/kontext/issues).

## Als Nächstes

| Funktion | Worum es geht |
| --- | --- |
| **Team-Chat: mehr** | Antworten im Faden, Reaktionen, Aufbewahrungsfrist, die der Chef einstellt. |

## Danach

| Funktion | Worum es geht |
| --- | --- |
| **Mehr für Aufgaben** | Eigene Spalten pro Board, wiederkehrende Aufgaben, Regel-Aktion „Aufgabe anlegen“, Abgleich mit Thunderbird und Handy-Apps über CalDAV (VTODO). |
| **Newsletter abbestellen** | Ein Knopf an Mails mit `List-Unsubscribe`, der die Abmeldung erledigt. |
| **Bilder je Absender erlauben** | Bilder aus dem Internet für bekannte Absender immer laden, statt bei jeder Mail neu zu fragen. |
| **Lesebestätigung** | Anfordern und beantworten, wie bei Behörden und Steuerberatern üblich. |
| **Verschlüsselung** | S/MIME oder PGP für Betriebe mit vertraulichen Kunden- oder Gesundheitsdaten. |
| **Telefonie** | Eine Firmennummer, die in Kontext klingelt: Festnetz und Handy über einen SIP-Anbieter (LiveKit SIP), Gruppenruf, Weiterleitung, Mailbox. |

## Offene Punkte

Kleinere Dinge, die beim Bauen aufgefallen sind und noch erledigt werden.

**Funktionen**

- [ ] Erinnerungen an Termine auch bei geschlossener App (heute nur, solange Kontext offen ist): der Server müsste die Kalender beobachten wie die Posteingänge.
- [ ] Chat-Suche: Umlaute in Groß- und Kleinschreibung („Ö“ findet „ö“ nicht), weil SQLite nur ASCII ohne Unterschied vergleicht.
- [ ] Chat: „Ganze Mail teilen“ als Kopie, für Kolleginnen ohne Zugriff auf das Postfach (heute sehen sie nur die Karte).
- [ ] Chat: Fotos als kleine Vorschaubilder auf dem Server erzeugen (heute lädt der Verlauf die verkleinerten Fotos in voller Größe).
- [ ] Aufgaben am Kontakt finden Mails nur über die letzten fünf Mails mit der Person im eigenen Postfach; ältere oder solche in info@ zählen nur, wenn die Aufgabe mit der Karte verknüpft ist (geschieht beim Anlegen aus der Mail). Die Verknüpfung „Termin“ wird noch nirgends angelegt.
- [ ] Erinnerung an Aufgaben auch direkt im Dialog „Neue Aufgabe“ (heute in der geöffneten Aufgabe).
- [ ] **Regeln für Mitarbeiter** in der Firmenverwaltung (heute nur für gemeinsame Postfächer und die eigenen).
- [ ] **App auf Englisch** und weiteren Sprachen (Texte liegen schon gesammelt in `messages/de.json`).
- [ ] Wiedervorlage für mehrere ausgewählte Mails auf einmal (heute aus der geöffneten Mail) und „Wieder vorgelegt“ auch in „Alle Posteingänge“ (heute im Posteingang des Postfachs).
- [ ] **Drucken mit Bildern aus dem Internet**, wenn sie in der Mail freigegeben wurden.
- [ ] Ideen aus dem ersten Entwurf, noch nicht eingeplant: **Belege**, **Buchung**, **Leitstand**, **Tickets**.

**Technik**

- [ ] e2e: lesende Tests öffnen Mails aus den Testdaten. Kommen im Posteingang von Jonas über 50 Test-Mails dazu, rutschen diese auf die zweite Seite der Liste; dann auch dort eigene Mails anlegen.
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
