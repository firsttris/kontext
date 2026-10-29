---
description: >-
  Kontext als App auf PC, Android und iPhone (PWA, ohne App Store): installieren,
  Benachrichtigungen auch bei geschlossener App, Tab-Leiste am Handy, hell und dunkel, als
  Mailprogramm für mailto-Links, Teilen in Kontext, Version und Updates, Passwort und Anmeldung
  mit Code.
---

# App, Handy und Konto

Kontext läuft im Browser und lässt sich auf jedem Gerät wie eine App installieren – am PC, unter
Android und am iPhone, ohne App Store. Was hier steht, stellt jede Person selbst ein, die meisten
Schalter unter *Einstellungen → Darstellung* und gelten für das eine Gerät.

![Kontext am Handy: Posteingang mit Tab-Leiste](screenshots/phone-mail.png){ width="260" }

## Als App installieren

- **Am Handy** bietet eine Karte oben in der Mailliste „Kontext als App aufs Handy“ an. Unter
  Android öffnet „Installieren“ den Dialog des Browsers. Auf iPhone und iPad in Safari auf
  „Teilen“ tippen, dann „Zum Home-Bildschirm“; neuere iOS-Versionen zeigen „Teilen“ erst nach
  langem Tippen auf die Adresszeile oder unter „•••“.
- **Am PC** unter *Einstellungen → Darstellung → App auf diesem Gerät* auf „Als App installieren“,
  oder im Browsermenü „App installieren“ wählen.
- Installiert hat Kontext ein eigenes Fenster und Symbol, die Zahl ungelesener Mails am Symbol
  (alle Posteingänge zusammen) und Kurzbefehle für Neue Mail, Kalender und Kontakte. Angemeldet
  bleibt man, bis man sich abmeldet.
- **Ohne Netz** startet die App trotzdem und sagt „Keine Verbindung“; neue Mails und Änderungen
  kommen, sobald das Gerät wieder online ist.

## Benachrichtigungen

„Auf diesem Gerät benachrichtigen“ – in der Glocke oben, unter *Einstellungen → Darstellung* oder
über die Karte in der Mailliste – meldet neue Mails, Chat-Nachrichten an einen selbst
(Direktnachrichten, @Erwähnungen), neue Aufgaben, Erinnerungen an Aufgaben und Termine und
eingehende Anrufe, **auch wenn Kontext ganz geschlossen ist**.

- Unter „Neue Mails melden aus“ lassen sich Postfächer abwählen, etwa info@ für jemanden, der dort
  nur aushilft; das gilt für alle Geräte der Person.
- Auf iPhone und iPad gibt es Benachrichtigungen nur in der installierten App.
- Blockiert der Browser sie, in den Website-Einstellungen des Browsers für Kontext erlauben.
- Wann ein Termin erinnert und ob per Hinweis oder Mail, steht am Termin
  ([Erinnerung je Termin](calendar-contacts.md#kalender)).
- Die Glocke selbst zeigt ungelesene Mails der letzten Tage, offene Einladungen und die Termine
  von heute. Mehr dazu in der [Architektur](architecture.md#benachrichtigungen).

## Am Handy

- Jede Ansicht ist ein eigener Bildschirm; unten steht die **Tab-Leiste** mit vier Apps und
  „Mehr“, anfangs Mail, Kalender, Chat und Aufgaben. Unter *Einstellungen → Darstellung →
  Tab-Leiste am Handy* wählt man pro Platz eine App; alle anderen stehen unter „Mehr“.
  „Zurücksetzen“ stellt die Leiste wie anfangs.
- „Zurück“ und das Wischen gehen dorthin zurück, woher man kam, etwa vom Gespräch in die Liste.
- **Teilen in Kontext:** Im Teilen-Menü anderer Apps steht Kontext. Geteilte Fotos, Dateien,
  Texte und Links zeigt Kontext zuerst an; „In neue Mail übernehmen“ öffnet eine neue Mail mit
  ihnen als Anhang.

## Darstellung

- **Farbschema:** „Wie das Gerät“, „Hell“ oder „Dunkel“, je Gerät.
- **Sprache:** „Wie das Gerät“ (die Sprache des Browsers), „Deutsch“ oder „English“, je Gerät;
  beim Wechsel lädt Kontext neu. Daten, Uhrzeiten und Zahlen folgen der Sprache (Englisch mit
  Tag vor Monat und 24-Stunden-Uhr).
- **Mail:** „Mails als Unterhaltungen gruppieren“ und wie lange „Senden rückgängig machen“ eine
  Mail zurückhält (siehe [Mail](mail.md#schreiben)).
- **Tastaturkürzel** stehen unten auf derselben Seite; am PC zeigt `?` sie überall.

## Als Mailprogramm verwenden

Ein Klick auf eine E-Mail-Adresse auf einer Webseite (`mailto:`) öffnet dann eine neue Mail in
Kontext. Die installierte App meldet sich dafür über ihr Manifest an; im Browser unter *Einstellungen →
Darstellung → App auf diesem Gerät* auf „Als Mailprogramm verwenden“, dann fragt der Browser, ob
Kontext E-Mail-Links öffnen soll. Der Knopf erscheint nur in Browsern, die das können.

## Version und Updates

*Einstellungen → Darstellung → App auf diesem Gerät* zeigt, welche Version auf dem Gerät läuft
(„Kontext 0.1.6“). Läuft auf dem Server schon eine neuere, steht sie darunter. Eine neue Version
meldet sich mit „Eine neue Version von Kontext ist da.“ und übernimmt erst nach „Neu laden“ –
eine angefangene Mail geht so nicht verloren. Sind alle Fenster zu, startet beim nächsten Öffnen
ohnehin die neue. Updates des Servers spielt der Betreiber ein
([Installation, Updates](installation.md#6-updates)).

## Profil, Passwort und Anmeldung mit Code

- **Profil** (*Einstellungen → Profil*): Name und Foto. Das Foto sehen die Kollegen im Chat, bei
  Anrufen, an Aufgaben und neben den Mails.
- **Passwort ändern** unter *Einstellungen → Passwort und Sicherheit*: mit dem aktuellen und
  zweimal dem neuen Passwort. Es gilt für Kontext, Handy und Mailprogramme.
- **Anmeldung mit Code** auf derselben Seite: Zusätzlich zum Passwort fragt Kontext nach einem
  Code aus einer Authenticator-App (z. B. Google Authenticator, Microsoft Authenticator,
  1Password). „Einrichten“, den QR-Code mit der App scannen (oder den Schlüssel von Hand
  eingeben), den angezeigten Code und das Passwort eingeben, „Einschalten“. Zum Ausschalten
  braucht es Passwort und aktuellen Code. Ob sie an ist, zeigt die Seite auf einen Blick.
- **Handy mit der Authenticator-App verloren:** Die Firmenverwaltung setzt die Anmeldung mit Code
  zurück (*Einstellungen → Firma → Mitarbeiter*); danach meldet man sich wieder nur mit Passwort
  an und richtet den Code neu ein ([Firmenverwaltung](company.md)).
- Mailprogramme und Handys verbinden sich weiter direkt mit dem Mailserver (IMAP, SMTP, CalDAV,
  CardDAV); Aufgaben gibt es dort als CalDAV-Aufgabenlisten ([Aufgaben](tasks.md)).
