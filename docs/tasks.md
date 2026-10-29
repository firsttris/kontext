---
description: >-
  Aufgaben und Kanban-Board im Team: aus Mails und Chat-Nachrichten, ein Board pro gemeinsamem
  Postfach, eigene Spalten, wiederkehrende Aufgaben, Erinnerungen als Push, Abgleich mit
  Thunderbird, tasks.org und Apple Erinnerungen über CalDAV.
---

# Aufgaben

Aufgaben gehören in Kontext dorthin, wo die Arbeit herkommt: zur Mail, zum Kunden, zum
gemeinsamen Postfach. Jedes Postfach hat sein Board – das eigene und eins für info@ und
rechnung@, das alle sehen, die dort arbeiten.

![Kanban-Board des gemeinsamen Postfachs info@ mit Offen, In Arbeit, Wartet und Erledigt](screenshots/tasks-board.png)

## Ansichten

- **Meine Aufgaben, Heute, Demnächst, Erledigt.**
- **Liste oder Kanban:** nach Fälligkeit gruppiert oder als Board mit Offen, In Arbeit, Wartet,
  Erledigt – Karten zwischen den Spalten ziehen.
- **Eigene Spalten** je Board („Material bestellt“ …), bis zu zehn.

## Aufgaben anlegen

- **Schnelleingabe:** „Rückruf Hoffmann morgen“ ist morgen fällig; auch Wochentage und Daten wie
  „30.10.“.
- **Aus einer Mail:** „Aufgabe“ (`t`) übernimmt den Betreff, verknüpft die Mail und den Kontakt
  und archiviert die Mail auf Wunsch; die Mail zeigt danach ihre Aufgabe. „Aufgaben erstellen“
  macht eine je ausgewählter Mail.
- **Aus einer Chat-Nachricht**, verknüpft in beide Richtungen.
- **Per Regel:** Eine Mail-Regel legt für jede passende Mail eine Aufgabe an, auch bei
  geschlossener App.
- **Aus einem verpassten Anruf:** „Zurückrufen“, das sich selbst abhakt, sobald jemand mit der
  Nummer gesprochen hat ([Telefonie](telephony.md)).
- **Wiederkehrend:** täglich, an Werktagen, wöchentlich, monatlich, jährlich.
- **Checklisten, Notizen, Zuständige, Fälligkeit, Erinnerung**, verknüpfte
  [Dokumente](documents.md). Die Erinnerung lässt sich schon im Dialog „Neue Aufgabe“ wählen;
  ein anderer Fälligkeitstag nimmt sie dort wie in der Aufgabe mit.

## Überall im Kontext

- **Am Kontakt** stehen seine offenen Aufgaben, **im Kalender** das Fällige am jeweiligen Tag,
  **in der Glocke** neu Zugewiesenes und heute Fälliges.
- **Erinnerungen und Zuweisungen** kommen als Benachrichtigung aufs Gerät, auch wenn Kontext zu
  ist.
- **Live:** Neue oder verschobene Aufgaben der Kollegen erscheinen sofort.

## In Thunderbird und am Handy

Kontext stellt die Boards als **CalDAV-Aufgabenlisten** bereit – in beide Richtungen, mit Titel,
Notiz, Fälligkeit, Erledigt, Wiederholung und Erinnerung:

- **Thunderbird:** im Kalender „Neuer Kalender …“ → „Im Netzwerk“, die Server-Adresse aus
  *Einstellungen → Aufgaben in anderen Apps* eintragen, die Aufgabenlisten anhaken.
- **Android:** DAVx⁵ mit tasks.org oder jtx Board, „Mit URL und Benutzername anmelden“.
- **iPhone und iPad:** *Einstellungen → Apps → Erinnerungen → Accounts → Account hinzufügen →
  Andere → CalDAV-Account*, als Server die ganze Adresse mit `/dav/` (die Domain allein führt zu
  den Kalendern in Stalwart).

Angemeldet wird mit Mail-Adresse und Passwort; mit Anmeldung in zwei Schritten geht das noch nicht
(App-Passwörter sind geplant). [Mehr](architecture.md#aufgaben)
