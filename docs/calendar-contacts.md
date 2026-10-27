---
description: >-
  Kalender und Kontakte für das Team auf dem eigenen Server: geteilte Kalender, Einladungen,
  Verfügbarkeit wie in Outlook, Videobesprechung am Termin, Kontakte mit letzten Mails und
  Terminen, Gruppen, vCard, CalDAV und CardDAV für Handy und Thunderbird.
---

# Kalender und Kontakte

Kalender und Adressbücher liegen in Stalwart und sprechen JMAP, CalDAV und CardDAV: Was in
Kontext steht, steht auch am iPhone, unter Android (DAVx⁵) und in Thunderbird.

![Kalender in der Wochenansicht mit Baubesprechung, Wartungstermin und Monatsübersicht](screenshots/calendar.png)

## Kalender

- **Tag, Woche, Monat und Liste**; Termine per Ziehen verschieben, wiederkehrende Termine mit
  Ausnahmen („nur dieser“ oder „ganze Serie“).
- **Einladungen** mit Zusage und Absage; die Glocke zeigt, was noch auf Antwort wartet, und die
  Termine des Tages.
- **Wer ist frei?** Beim Einladen von Kollegen zeigt Kontext, wer zu der Zeit belegt ist, und
  schlägt die nächsten Zeiten vor, in denen alle frei sind – wie Outlooks
  Terminplanungs-Assistent. In der Firma sieht jeder, wann Kollegen belegt sind (ohne Titel);
  abschaltbar je Kalender. [Mehr](architecture.md#verfugbarkeit)
- **Kalender teilen** mit Kollegen: nur Verfügbarkeit, lesen oder bearbeiten.
- **Videobesprechung am Termin:** Ein Klick legt einen Link an; Kunden kommen im Browser ohne
  Konto dazu, sobald jemand aus der Firma da ist. Siehe [Team-Chat und Videocalls](chat.md#videocalls-und-besprechungen).
- **Aufgaben im Kalender:** die eigenen offenen Aufgaben am Tag ihrer Fälligkeit.
- **Dokumente am Termin:** eine Datei aus [Dokumente](documents.md) anhängen, die Eingeladenen
  dürfen sie öffnen.
- **Am Handy:** Tagesansicht mit Wochenleiste, Monat und Liste.

## Kontakte

- **Der Kunde auf einen Blick:** die letzten Mails mit ihm (auch aus info@), die nächsten
  Termine, offene Aufgaben, verknüpfte Dokumente, „Anrufen“ über die [Telefonie](telephony.md).
- **Anlegen und bearbeiten**, auch „Als Kontakt speichern“ direkt neben einer Mail.
- **Gruppen** wie „Lieferanten“, an die eine Mail geht.
- **vCard-Import und -Export**; Doppeltes wird beim Import erkannt.
- **Weitere Kontakte** wie bei Google: Wer einem geschrieben hat oder wem man geschrieben hat,
  aber in keinem Adressbuch steht, erscheint hier – mit „Zu Kontakten hinzufügen“ und „Mail
  schreiben“. Kontext liest dafür die letzten 500 Mails jedes Postfachs (ohne Spam und
  Papierkorb); Newsletter (`List-Id`, `List-Unsubscribe`), Absender wie `noreply@`, Kollegen und
  die eigenen Adressen fehlen. Gespeichert wird nichts: Wer Kontakt wird, verschwindet aus der
  Liste.
- **Zusammenführen und korrigieren:** Kontakte mit derselben Mail-Adresse, Telefonnummer
  (`07223 4711` und `+49 7223 4711` zählen gleich) oder demselben Namen schlägt Kontext zum
  Zusammenführen vor, die Zahl steht neben dem Eintrag. Es bleibt der vollständigste Kontakt; er
  bekommt alle Adressen, Nummern, Notizen, Links und Adressbücher der anderen, und Gruppen
  zeigen auf ihn. Zusammengeführt wird nur innerhalb eines Kontos und nur, wo man schreiben
  darf. Namen ganz in Groß- oder Kleinbuchstaben („MAX MUSTERMANN“) bietet Kontext in üblicher
  Schreibweise an. „Ignorieren“ merkt sich der Browser.
- **Adressbücher teilen** mit Kollegen – lesen oder bearbeiten.

![Kontakt Markus Hoffmann mit nächsten Terminen und letzten Mails](screenshots/contacts.png)

## Mit anderen Programmen

Stalwart ist zugleich CalDAV- und CardDAV-Server: Handy und Thunderbird finden Kalender und
Adressbücher über `https://kontext.firma.de/.well-known/caldav` bzw. `…/carddav` und die eigene
Mail-Adresse. Aufgaben stellt Kontext als eigene CalDAV-Aufgabenlisten bereit, siehe
[Aufgaben](tasks.md#in-thunderbird-und-am-handy).
