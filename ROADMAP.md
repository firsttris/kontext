# Roadmap

Was als Nächstes in Kontext kommt, sortiert nach Nutzen für kleine Betriebe. Die Reihenfolge ist
ein Plan, kein Versprechen; Wünsche und Hinweise gern als
[Issue](https://github.com/firsttris/kontext/issues).

## Als Nächstes

| Funktion | Worum es geht |
| --- | --- |
| **Unterhaltungen** | Antworten zu einem Verlauf zusammenfassen: eine Zeile pro Unterhaltung in der Liste, alle Mails darin untereinander im Lesebereich. Die Daten (`threadId`) lädt die App schon. |
| **Senden rückgängig** | Nach „Senden“ ein paar Sekunden, um es zurückzunehmen (Tippfehler, falscher Empfänger). |
| **Später senden** | Eine Mail zu einem Zeitpunkt verschicken lassen, etwa morgen um 8 Uhr. |
| **Wiedervorlage** | Eine Mail ausblenden, bis sie zu einem Zeitpunkt wieder oben im Posteingang auftaucht – zusammen mit den Kategorien eine einfache Aufgabenliste. |
| **Textbausteine** | Vorlagen für Standardantworten (Angebotsanfrage, Terminbestätigung, Rechnungsnachfrage), auch pro gemeinsamem Postfach für das ganze Team. |

## Danach

| Funktion | Worum es geht |
| --- | --- |
| **Newsletter abbestellen** | Ein Knopf an Mails mit `List-Unsubscribe`, der die Abmeldung erledigt. |
| **Bilder je Absender erlauben** | Bilder aus dem Internet für bekannte Absender immer laden, statt bei jeder Mail neu zu fragen. |
| **Lesebestätigung** | Anfordern und beantworten, wie bei Behörden und Steuerberatern üblich. |
| **Verschlüsselung** | S/MIME oder PGP für Betriebe mit vertraulichen Kunden- oder Gesundheitsdaten. |

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

Regeln (auch für gemeinsame Postfächer und auf vorhandene Mails), Kategorien (im Team geteilt,
per Regel gesetzt, beim Umzug übernommen), mehrere Mails auf einmal bearbeiten, Drucken,
Benachrichtigungen, Speicherplatz, Warnungen vor gefälschten Absendern, Anhänge mit Vorschau,
Mails zwischen Postfächern verschieben. Alles Weitere steht in der
[Dokumentation](https://firsttris.github.io/kontext/).
