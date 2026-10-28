---
description: >-
  Barrierefreiheit in Kontext: Ziel WCAG 2.2 AA (EN 301 549, BITV 2.0), Bedienung mit Tastatur und
  Screenreader, Kontraste, hell und dunkel, weniger Bewegung, wie es geprüft wird und was noch
  offen ist.
---

# Barrierefreiheit

Kontext soll für alle nutzbar sein, auch mit Screenreader, nur mit der Tastatur oder mit
vergrößerter Schrift. Das Ziel ist **WCAG 2.2 Stufe AA**, der Kern der europäischen Norm
EN 301 549 und damit der BITV 2.0, die für öffentliche Stellen gilt. Bei Ausschreibungen und für
Arbeitsplätze von Beschäftigten mit Behinderung (SGB IX § 164) ist das die Messlatte.

## Was Kontext dafür tut

- **Screenreader:** Jeder Knopf ohne Text hat einen Namen („Antworten“, „Als gelesen markieren“),
  Symbole daneben sind ausgeblendet. Meldungen wie „Gesendet“ oder Fehler werden vorgelesen
  (`role="status"` und `role="alert"`). Listen, Auswahlfelder und das Empfängerfeld tragen die
  passenden Rollen; die geöffnete Mail, der gewählte Tag und die gewählte Ansicht sind als
  aktuell markiert. Die Seite ist als Deutsch ausgezeichnet.
- **Tastatur:** Alles ist mit der Tastatur erreichbar, der Fokus ist immer als Rahmen zu sehen.
  Der erste Tab-Stopp ist „Zum Inhalt springen“ (sichtbar, sobald er den Fokus hat): an App-Leiste
  und Seitenleiste vorbei zur Mailliste, zur Kontaktliste oder zum Inhalt der Seite. Dialoge und
  Menüs halten den Fokus, Escape schließt sie, danach steht er wieder auf dem, was sie geöffnet
  hat; ein neuer Dialog beginnt im ersten Feld. Der kleine Monat im Kalender ist ein einziger
  Tab-Stopp: die Pfeiltasten gehen von Tag zu Tag (hoch und runter um eine Woche), Bild auf und
  Bild ab um einen Monat, Enter zeigt den Tag. Strg+Enter sendet die Mail, die man schreibt.
  Was sich ziehen lässt, geht auch ohne Maus: Mails über „Verschieben nach …“, Aufgaben über
  ihre Spalte in der Aufgabe, Termine über Datum und Uhrzeit im Termin, Dateien über „Anhängen“.
  Dazu kommen Tastaturkürzel wie in Gmail; `?` zeigt sie ([App, Handy und Konto](app.md)).
- **Am Handy:** Was dort ein langes Drücken öffnet, etwa die Aktionen zu einer Chat-Nachricht,
  erreicht ein Screenreader über einen eigenen, unsichtbaren Knopf. Vergrößern mit zwei Fingern
  bleibt möglich.
- **Kontraste:** Texte haben mindestens 4,5 : 1 zu ihrem Hintergrund, hell wie dunkel.
- **Weniger Bewegung:** Ist in den Systemeinstellungen „Bewegung reduzieren“ an, erscheinen
  Blätter, Hinweise und Dialoge ohne Animation.
- **Hell und dunkel** folgen dem Gerät oder der Wahl unter *Einstellungen → Darstellung*.

## Wie es geprüft wird

Bei jedem Push prüft `e2e/accessibility.spec.ts` mit [axe-core](https://github.com/dequelabs/axe-core)
jede Seite (Anmeldung, Mail, Neue Mail, Kalender, Kontakte, Chat, Aufgaben, Einstellungen,
Dokumente) hell und dunkel, am Desktop und am Handy, gegen die Regeln von WCAG 2.2 AA. Ein
einziger Verstoß macht den Test rot. `e2e/keyboard.spec.ts` geht die Wege nur mit der Tastatur:
zum Inhalt springen, Dialoge auf und zu, der kleine Monat, Senden mit Strg+Enter. Dazu suchen die übrigen End-to-End-Tests Elemente so, wie ein
Screenreader sie findet (nach Rolle und Name), und prüfen damit die Beschriftungen nebenbei mit.

Eine Maschine findet aber nur einen Teil der Probleme. Ob eine Beschriftung verständlich ist, die
Reihenfolge beim Vorlesen stimmt und ein Ablauf mit Screenreader zu schaffen ist, muss ein Mensch
prüfen.

## Was noch offen ist

- **Prüfung von Hand:** Ein vollständiger Durchgang mit NVDA, VoiceOver und TalkBack steht aus,
  ebenso ein Test nach BITV-Prüfverfahren durch eine unabhängige Stelle.
- **Mails von außen:** Wie barrierefrei eine empfangene HTML-Mail ist, entscheidet ihr Absender.
- **Videocalls:** Es gibt noch keine Live-Untertitel.
- **Dokumente:** Word, Excel und PowerPoint öffnet [Schreibzeug](documents.md); wie weit dessen
  Editor mit Screenreader nutzbar ist, steht in seiner eigenen Dokumentation.

## Barrierefreiheitserklärung

Öffentliche Stellen müssen für ihre Anwendungen eine Erklärung zur Barrierefreiheit
veröffentlichen. Wer Kontext betreibt, kann diese Seite als Grundlage nehmen: Stand der
Vereinbarkeit „teilweise vereinbar“, solange die Prüfung von Hand aussteht, mit den offenen Punkten
oben als nicht barrierefreie Inhalte.
