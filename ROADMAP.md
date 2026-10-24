# Roadmap

Was als Nächstes in Kontext kommt, sortiert nach Nutzen für kleine Betriebe. Die Reihenfolge ist
ein Plan, kein Versprechen; Wünsche und Hinweise gern als
[Issue](https://github.com/firsttris/kontext/issues).

## Als Nächstes

| Funktion | Worum es geht |
| --- | --- |
| **Aufgaben überall im Kontext** | Offene Aufgaben am Kontakt, Fälliges im Kalender, Heute-Fälliges und neu Zugewiesenes in der Glocke, Erinnerungen als Benachrichtigung, „Aufgaben erstellen“ für mehrere Mails. |
| **Team-Chat: Feinschliff** | Suche im Chat, eigene Nachrichten bearbeiten und löschen, Kanäle stummschalten und verlassen; später Antworten im Faden, Reaktionen, „Besprechung starten“. |
| **Benachrichtigungen bei geschlossener App** | Web Push: Stalwart kann ihn selbst senden (`urn:ietf:params:jmap:webpush-vapid`), damit das Handy auch bei ganz geschlossener App neue Mails meldet; für Direktnachrichten und Erwähnungen im Chat sendet ihn der Kontext-Server. |
| **Unterhaltungen** | Antworten zu einem Verlauf zusammenfassen: eine Zeile pro Unterhaltung in der Liste, alle Mails darin untereinander im Lesebereich. Die Daten (`threadId`) lädt die App schon. |
| **Senden rückgängig** | Nach „Senden“ ein paar Sekunden, um es zurückzunehmen (Tippfehler, falscher Empfänger). |
| **Später senden** | Eine Mail zu einem Zeitpunkt verschicken lassen, etwa morgen um 8 Uhr. |
| **Wiedervorlage** | Eine Mail ausblenden, bis sie zu einem Zeitpunkt wieder oben im Posteingang auftaucht – zusammen mit den Kategorien eine einfache Aufgabenliste. |
| **Textbausteine** | Vorlagen für Standardantworten (Angebotsanfrage, Terminbestätigung, Rechnungsnachfrage), auch pro gemeinsamem Postfach für das ganze Team. |

## Danach

| Funktion | Worum es geht |
| --- | --- |
| **Mehr für Aufgaben** | Eigene Spalten pro Board, wiederkehrende Aufgaben, Regel-Aktion „Aufgabe anlegen“, Abgleich mit Thunderbird und Handy-Apps über CalDAV (VTODO). |
| **Newsletter abbestellen** | Ein Knopf an Mails mit `List-Unsubscribe`, der die Abmeldung erledigt. |
| **Bilder je Absender erlauben** | Bilder aus dem Internet für bekannte Absender immer laden, statt bei jeder Mail neu zu fragen. |
| **Lesebestätigung** | Anfordern und beantworten, wie bei Behörden und Steuerberatern üblich. |
| **Verschlüsselung** | S/MIME oder PGP für Betriebe mit vertraulichen Kunden- oder Gesundheitsdaten. |

## Offene Punkte

Kleinere Dinge, die beim Bauen aufgefallen sind und noch erledigt werden.

**Funktionen**

- [ ] Chat: Wer neu in einen Kanal kommt, hat den ganzen bisherigen Verlauf als ungelesen.
- [ ] Chat: einen eigenen Kanal verlassen oder löschen (heute nur Name und Mitglieder ändern).
- [ ] Chat: „Ganze Mail teilen“ als Kopie, für Kolleginnen ohne Zugriff auf das Postfach (heute sehen sie nur die Karte).
- [ ] Chat: Fotos als kleine Vorschaubilder auf dem Server erzeugen (heute lädt der Verlauf die verkleinerten Fotos in voller Größe).
- [ ] Aufgabe aus einer Mail mit dem Absender als Kontakt verknüpfen; die Verknüpfungen „Kontakt“ und „Termin“ öffnen sich schon richtig, werden aber noch nirgends angelegt.
- [ ] **Regeln für Mitarbeiter** in der Firmenverwaltung (heute nur für gemeinsame Postfächer und die eigenen).
- [ ] **App auf Englisch** und weiteren Sprachen (Texte liegen schon gesammelt in `messages/de.json`).
- [ ] **Drucken mit Bildern aus dem Internet**, wenn sie in der Mail freigegeben wurden.
- [ ] Ideen aus dem ersten Entwurf, noch nicht eingeplant: **Belege**, **Buchung**, **Leitstand**, **Tickets**.

**Technik**

- [ ] e2e: lesende Tests öffnen Mails aus den Testdaten. Kommen im Posteingang von Jonas über 50 Test-Mails dazu, rutschen diese auf die zweite Seite der Liste; dann auch dort eigene Mails anlegen.
- [ ] Lokal fehlt `readpst` für den Outlook-Test (`sudo apt install pst-utils`).
- [ ] README: Screenshots von Aufgaben, Board, Regeln und Chat ergänzen; dafür Chat-Beispieldaten in den Testdaten (heute legt der Seed nur Stalwart-Daten an).
- [ ] Der Server fragt für jede Chat- und Aufgaben-Anfrage (auch „schreibt …“) Stalwart nach der JMAP-Session; kurz zwischenspeichern.

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

Team-Chat mit Kanälen (#allgemein, einer pro gemeinsamem Postfach, eigene), Direktnachrichten,
@Erwähnungen, „schreibt …“, Gelesen und Ungelesen, Fotos und Dateien, Mails, Aufgaben und
Kontakte als Karten, „Über diese Mail sprechen“ und Aufgaben aus Nachrichten – live über eine
eigene Verbindung, die auch Aufgaben sofort abgleicht; am Handy eine Tab-Leiste mit Chat und „Mehr“.
Aufgaben mit Liste und Kanban-Board (eigene und pro gemeinsamem Postfach, aus Mails heraus, mit
Checkliste, Zuständigen und Fälligkeit), Kontext als installierbare App (PWA),
Regeln (auch für gemeinsame Postfächer und auf vorhandene Mails), Kategorien (im Team geteilt,
per Regel gesetzt, beim Umzug übernommen), mehrere Mails auf einmal bearbeiten, Drucken,
Benachrichtigungen, Speicherplatz, Warnungen vor gefälschten Absendern, Anhänge mit Vorschau,
Mails zwischen Postfächern verschieben. Alles Weitere steht in der
[Dokumentation](https://firsttris.github.io/kontext/).
