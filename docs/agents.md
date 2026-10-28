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
