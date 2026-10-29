---
description: >-
  Telefonie in Kontext: CTI für die Fritzbox – Anrufe klingeln im Browser mit Kontakt, letzter
  Mail und nächstem Termin, Softphone, Mailbox als Mail, Öffnungszeiten, Weitervermitteln,
  Snom-Tischtelefone, Fax als PDF. Selbst gehostet mit Asterisk und LiveKit.
---

# Telefonie (CTI) mit der Fritzbox

Kontext verbindet das Firmentelefon mit Mail, Kontakten und Kalender (**CTI**, Computer Telephony
Integration): Ruft ein Kunde an, zeigt Kontext sofort, wer es ist – Kontakt, Firma, letzte Mail,
nächster Termin – und man nimmt im Browser an, am Rechner oder am Handy. Angerufen wird mit einem
Klick am Kontakt. Die Fritzbox bleibt am Anschluss, Nummern und Tischtelefone bleiben, wie sie
sind; eine kleine **Telefonbox** im Büro meldet sich an der Fritzbox als IP-Telefon an und
verbindet sie mit Kontext. Keine Telefonanlage aus der Cloud, keine Kosten pro Nebenstelle.

!!! note "Im Test"
    Die Telefonie läuft beim ersten Kunden im Test. Rückmeldungen gern als
    [Issue](https://github.com/firsttris/kontext/issues).

![Ein Anruf über die Fritzbox klingelt in Kontext: Karte mit Kontakt, Firma, Nummer und letzter Mail von Petra Keller, daneben der Posteingang](screenshots/phone-call.png)

## Was man damit tut

- **Anruf mit Kontext:** Bei den Personen, die klingeln sollen, erscheint eine Karte mit Name,
  Firma, letzter Mail und nächstem Termin und „Annehmen“ – auch als Benachrichtigung auf dem
  Gerät, wenn Kontext zu ist. Wer eine Nummer nicht im Adressbuch hat, sieht die Nummer.
- **Annehmen im Browser oder am Tischtelefon:** Wer zuerst abnimmt, hat den Anruf. Kontext ist
  dabei ein Softphone mit Mikrofon und Lautsprecher (WebRTC); das Gespräch bleibt offen, während
  man zwischen Mail, Kalender und Chat wechselt.
- **Anrufen** aus jedem Kontakt, aus der Seitenleiste neben einer Mail oder auf der Seite
  *Telefon*; ein Tastenfeld schickt Töne für Sprachmenüs (DTMF).
- **Anrufliste** mit angenommenen, verpassten und abgewiesenen Anrufen, Notiz am Anruf und
  „Zurückrufen“.
- **Rückruf als Aufgabe:** Ein verpasster Anruf legt „Zurückrufen: …“ auf dem gewählten Board an,
  fällig heute; sobald jemand mit der Nummer gesprochen hat, hakt sich die Aufgabe selbst ab.

## Mailbox, Öffnungszeiten, Sprachmenü

- **Mailbox:** Nimmt niemand ab, spielt die Box die Ansage und nimmt eine Nachricht auf (bis zu
  zwei Minuten). Sie kommt als **Mail mit der Aufnahme** in das gewählte Postfach und lässt sich
  am Anruf abspielen. Ansagen spricht man direkt im Browser ein oder lädt sie hoch.
- **Öffnungszeiten** mit Mittagspause, geschlossenen Tagen und den Feiertagen des eigenen Bundeslands mit einem Klick:
  Außerhalb klingelt nichts, Anrufer hören die Ansage für „geschlossen“ und können eine Nachricht
  hinterlassen. Das prüft die Box selbst, auch wenn Kontext gerade nicht erreichbar ist.
- **Sprachmenü:** „Für den Kundendienst drücken Sie die 1 …“ – jede Taste klingelt bei ihren
  Leuten (das Thema steht am Anruf) oder führt auf die Mailbox.
- **Sperrliste:** „Sperren“ in der Anrufliste, auf Wunsch alle unterdrückten Nummern; die Box
  weist sie ab, bevor etwas klingelt.

## Im Gespräch

- **Weitervermitteln** an eine Kollegin (es klingelt bei ihr, man geht, sobald sie dran ist), an
  eine beliebige Nummer oder an ein Telefon der Fritzbox (`**610`).
- **Halten, Rückfrage, Dreierkonferenz:** Wartemusik für den Anrufer, eine Kollegin erst fragen,
  dann den Anrufer zurückholen und zu dritt sprechen – oder die beiden allein lassen.
- **Gespräche aufnehmen**, wenn die Firma es erlaubt: Die Box spielt dem Anrufer vorher einen
  Hinweis (Einverständnis nach § 201 StGB); die Aufnahme liegt beim Anruf, sie wird nicht gemailt.

## Wer klingelt wann

- **Alle gleichzeitig oder der Reihe nach** (jede Person eine Weile, dann alle), dazu auf Wunsch
  ein **Handy**, das nach einer eingestellten Zeit mitklingelt.
- **Durchwahlen:** weitere Nummern des Anschlusses, jede klingelt bei ihren Leuten, die mit ihr
  auch anrufen.
- **Präsenz:** „telefoniert“ steht im Chat an der Person; mit *Bitte nicht stören* oder *Abwesend
  bis …* klingelt es bei den anderen (auch das eigene Tischtelefon bleibt still).

## Geräte im Büro

- **Snom-Tischtelefone** melden sich an der Box an und holen sich ihre Einstellungen selbst
  (Provisionierung): Sie klingeln zusammen mit Kontext, erreichen sich per Kurzwahl und lassen
  sich beim Weitervermitteln wählen.
- **Türsprechstelle** der Fritzbox: Es klingelt in Kontext mit „Tür öffnen“ und „Sprechen“.
- **Fax als PDF-Mail:** Eine Nummer des Anschlusses nimmt Faxe an; jedes kommt als PDF in das
  gewählte Postfach.
- **Notruf** (110, 112) und Kurzwahlen gehen direkt über die Fritzbox; fällt das Internet aus,
  bleiben die Telefone an der Fritzbox.

## Auswertung

Anrufe der letzten 30 Tage: wie viele, wie schnell angenommen, wann Anrufe verpasst wurden
(Wochentag × Stunde), außerhalb der Öffnungszeiten, Nachrichten und wer angenommen hat.

## Was es braucht

- eine **Fritzbox** am Anschluss (Telefonie → Telefoniegeräte → IP-Telefon „Kontext“);
- die **Telefonbox** im Büronetz: ein Container mit Asterisk und dem Box-Agent, auf einem
  gebrauchten Thin Client, einem Raspberry Pi, dem Firmenserver oder einem NAS mit Docker. Sie
  baut die Verbindung zu Kontext von innen auf, **beim Kunden ist kein Port offen**;
- auf dem Server **LiveKit** und **LiveKit SIP** (in `compose.yaml` mit dem Profil `calls`).

Einrichtung Schritt für Schritt: [Installation → Telefonie](installation.md#telefonie). Wie Box,
Asterisk, LiveKit SIP und Kontext zusammenspielen: [Architektur → Telefonie](architecture.md#telefonie).
Was als Nächstes kommt (SIP-Trunk direkt beim Anbieter, SIP über TLS, Warteschleife, weitere
Tischtelefone): [Roadmap](https://github.com/firsttris/kontext/blob/main/ROADMAP.md).
