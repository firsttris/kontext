---
description: >-
  KI-Agenten wie Claude mit Kontext verbinden (MCP-Server): Kunden, Mails, Termine und Aufgaben
  nachschlagen, Entwürfe, Termine (mit Kollegen), Kontakte und Aufgaben anlegen – nie nach draußen
  senden oder löschen; Anmeldung per OAuth oder Zugangsschlüssel, jede Änderung protokolliert.
---

# KI-Agenten (MCP)

Kontext ist ein **MCP-Server** ([Model Context Protocol](https://modelcontextprotocol.io)): Ein
KI-Agent wie Claude arbeitet mit den Mails, Terminen, Kontakten und Aufgaben der Person, die ihn
verbunden hat – mit genau ihren Rechten, gemeinsame Postfächer und „nur lesen“ eingeschlossen.

## Was ein Agent kann

- **Nachschlagen:** „Was war zuletzt mit Hoffmann?“ – Kontakt, letzte Mails aus allen
  Postfächern, Termine davor und danach, offene Aufgaben; Mails suchen mit der Sprache des
  Suchfelds (`von:`, `in:info@`, `ist:ungelesen` …), Unterhaltungen lesen, Termine und Aufgaben
  auflisten.
- **Anlegen und ändern**, wenn man es erlaubt: Entwürfe (auch als Antwort mit Zitat), Termine
  mit Einladung an Kollegen, Kontakte, Aufgaben.
- **Nie von selbst nach draußen:** Es gibt kein Löschen und keine Mail an jemanden außerhalb der
  Firma. Eine Antwort wartet in „Entwürfe“, bis jemand sie in Kontext abschickt. Zu einem Termin
  lädt der Agent nur Kollegen ein: Sie bekommen die Einladung und den Termin in ihren Kalender wie
  aus Kontext; eine Adresse von draußen lehnt er ab, die lädt man selbst in Kontext ein.
- **Protokoll:** Jede Änderung steht bei der Verbindung unter „Letzte Änderungen“; höchstens 100
  Änderungen pro Stunde.

## Verbinden

- **Claude (App, Desktop, claude.ai):** `https://kontext.firma.de/mcp` als Connector eintragen und
  im Browser anmelden (OAuth 2.1); Kontext fragt, was der Agent darf, und das Passwort.
- **Claude Code, Skripte und andere Clients:** unter *Einstellungen → KI-Agenten* einen
  Zugangsschlüssel anlegen und als `Authorization: Bearer kontext_…` mitgeben.

Jede Verbindung hat eine eigene Sitzung und lässt sich einzeln trennen; wird ein Mitarbeiter
gesperrt, sind auch seine Agenten getrennt. Auf dem Server ist nichts einzurichten
([Installation → KI-Agenten](installation.md#ki-agenten)). Die Werkzeuge im Einzelnen:
[Architektur → Agenten](architecture.md#agenten-mcp).

## Assistent im Chat

Ohne eigenen Agenten geht es auch: Im Chat steht oben der **Assistent**. Man fragt ihn in Worten
(„Was gab es zuletzt mit Keller Elektro?“, „Schreib Frau Keller, dass wir Dienstag kommen“), er
nutzt dieselben Werkzeuge wie ein verbundener Agent, mit den Rechten der Person, die fragt, und
legt auf Wunsch Entwürfe, Termine, Kontakte und Aufgaben an; was er angelegt hat, steht unter
seiner Antwort. Wie ein Agent schickt er nichts nach draußen und löscht nichts: Entwürfe sendet man selbst, zu Terminen lädt er nur Kollegen ein.

- **Einrichten:** Die Firmenverwaltung trägt unter *Einstellungen → Chat* einen Schlüssel der
  Claude API (console.anthropic.com) ein und wählt das Modell
  ([Installation → KI-Agenten](installation.md#ki-agenten)). Ohne Schlüssel gibt es keinen
  Assistenten.
- **Kosten:** Anthropic rechnet nach Nutzung ab; eine Frage mit ein paar Nachschlagen kostet mit
  dem voreingestellten Modell (Claude Sonnet 5.5) meist ein paar Cent.
- **Daten:** Die Frage und was der Assistent dafür nachschlägt (Mailtext, Termine, Kontakte)
  gehen an Anthropic; das steht unter dem Eingabefeld. Kontext speichert das Gespräch nicht, es
  bleibt im offenen Tab, bis man ihn neu lädt, sich abmeldet oder „Neues Gespräch“ wählt.
