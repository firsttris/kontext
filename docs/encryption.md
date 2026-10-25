# Verschlüsselung

Wie Kontext Mails, Chat, Aufgaben und Dateien schützt – ein Konzept in Schichten. Nicht alles
muss Ende-zu-Ende verschlüsselt sein: Kontext läuft auf dem eigenen Server des Betriebs, und viele
Funktionen (Suche, Regeln, Benachrichtigungen mit Text, Aufgaben aus Mails) brauchen einen
Server, der die Inhalte lesen kann. Ende-zu-Ende gibt es dort, wo es zählt: nach außen und für
ausgewählte vertrauliche Unterhaltungen.

Stand: Baustein 1 ist umgesetzt, 2 in Arbeit, 3 bis 5 geplant ([Roadmap](https://github.com/firsttris/kontext/blob/main/ROADMAP.md)).

## Wovor geschützt wird

| Gefahr | Beispiel | Baustein |
| --- | --- | --- |
| Mitlesen unterwegs | offenes WLAN, fremde Mailserver auf dem Weg | 1 |
| Gestohlene Platte oder Sicherung | Server-Diebstahl, Backup beim Dienstleister | 1 |
| Vertrauliches nach außen | Befunde, Steuerunterlagen, Lohnabrechnungen an Kunden, Behörden, Steuerberater (DSGVO Art. 32, Berufsgeheimnis § 203 StGB) | 2, 3, 4 |
| Vertrauliches nach innen | Personalthemen, die auch der Admin nicht lesen soll | 5 |

Nicht geschützt – und auch nicht Ziel: ein Gerät, das schon in fremden Händen und entsperrt ist;
wer auf dem Server Administrator ist, kann alles außer Ende-zu-Ende-Verschlüsseltem lesen.

## Baustein 1: Grundschutz – unsichtbar, für alles

- **Unterwegs:** App und Server sprechen nur über HTTPS. Für Mails an andere Server verlangt
  Stalwart Verschlüsselung, wo der Empfänger sie zusagt (MTA-STS, DANE), und versucht sie sonst
  (STARTTLS). Eingehend nimmt Stalwart verschlüsselt an.
- **Gespeichert:** Die Platte des Servers ist verschlüsselt (LUKS o. ä.), Sicherungen werden
  verschlüsselt abgelegt (z. B. restic). Das betrifft alles auf einmal: Stalwarts Postfächer,
  Kontexts Datenbank (Chat, Aufgaben) und die Dateien des Chats. Die
  [Installation](installation.md) beschreibt es.
- **Sichtbar:** Eine Mail zeigt neben „Details anzeigen“, ob sie verschlüsselt beim eigenen
  Server ankam – aus der obersten `Received`-Zeile, dem Protokoll nach `with` (RFC 3848: `ESMTPS`,
  `ESMTPSA`; `src/lib/transport.ts`). Unverschlüsselt Angekommenes ist gelb markiert; was auf dem
  Server selbst entstand (Einladungen, Mails unter Kolleginnen), zeigt nichts.
- **Geprüft:** Die Firmenverwaltung („Sicherheit der Mails“) zeigt je Domain MX, SPF, DMARC,
  MTA-STS samt Modus der Richtlinie, TLS-RPT und DANE (TLSA mit DNSSEC) und ob Kontext über HTTPS
  läuft – jeweils mit dem, was zu tun ist. Abgefragt über DNS-over-HTTPS (`DOH_URL`, sonst
  Cloudflare), das auch sagt, ob eine Antwort signiert ist (`server/company/security.ts`). Die
  verschlüsselte Platte lässt sich von dort nicht sehen; die Seite verweist auf die Anleitung.

## Baustein 2: ein Schlüssel pro Person

Jede Person hat einen persönlichen OpenPGP-Schlüssel (Curve25519), mit dem sie Mails
unterschreibt und entschlüsselt – und der später auch vertrauliche Chats trägt (Baustein 5).

- **Entstehen:** Kontext legt ihn beim ersten Mal an, im Browser; oder man bringt einen
  vorhandenen mit (z. B. aus Thunderbird) und importiert ihn.
- **Aufbewahren:** Der geheime Teil verlässt den Browser nur verschlüsselt – mit einer
  Passphrase, die nur die Person kennt – und liegt so auf dem Kontext-Server, damit er auf allen
  Geräten da ist. Der Server kann ihn nicht öffnen. Im Browser bleibt er nach dem Entsperren nur
  im Speicher des Tabs.
- **Wiederherstellen:** Beim Anlegen gibt es einen Wiederherstellungscode zum Ausdrucken; ohne
  Passphrase und Code ist der Schlüssel verloren – und mit ihm, was an ihn verschlüsselt war.
- **Verteilen:** Der öffentliche Teil geht mit jeder Mail mit (`Autocrypt`-Kopfzeile), lässt
  sich herunterladen und wird – wenn die Domain mitspielt – per WKD gefunden, wie Thunderbird
  und andere es tun.
- **Schlüssel der anderen:** Kontext sammelt sie aus eingehenden Mails (`Autocrypt`, angehängte
  Schlüssel), sucht sie auf keys.openpgp.org und per WKD und nimmt sie von Hand entgegen. Sie
  liegen je Person auf dem Server, mit Herkunft und Fingerabdruck; ein neuer Schlüssel für eine
  bekannte Adresse wird angezeigt, nicht still übernommen.

## Baustein 3: PGP in Mails

- **Lesen:** PGP/MIME (`multipart/encrypted`) und eingebettetes PGP werden nach dem Entsperren
  im Browser entschlüsselt und wie jede Mail gezeigt, mit Anhängen. Unterschriften werden
  geprüft: „Unterschrieben von … – geprüft“, oder eine Warnung.
- **Senden:** Ein Schloss im Fenster „Neue Mail“ verschlüsselt an alle Empfänger und an sich
  selbst (so ist die Kopie in „Gesendet“ lesbar); unterschrieben wird immer, wenn ein Schlüssel
  da ist. Die App baut die ganze Mail (Text, HTML, Anhänge) als MIME, verschlüsselt sie und
  schickt sie über Stalwart (`Email/import`, `EmailSubmission`) – der Server sieht nur
  Verschlüsseltes. Der Betreff bleibt sichtbar, wie in PGP üblich; ein Hinweis sagt das.
- **Grenzen:** Verschlüsselte Mails findet die Suche nur über Betreff und Absender; Regeln
  sehen den Inhalt nicht.

## Baustein 4: „Vertraulich senden“ – für alle Empfänger

Ein Schalter für Mails nach außen; Kontext nimmt je Empfänger den besten Weg:

1. **Hat einen PGP-Schlüssel** → PGP (Baustein 3).
2. **Hat ein S/MIME-Zertifikat** (häufig bei Behörden und Kanzleien) → S/MIME. Eigene
   Zertifikate werden wie PGP-Schlüssel verwahrt (PKCS#12, mit Passphrase).
3. **Hat nichts davon** → eine Mail mit einem Link. Die Nachricht samt Anhängen bleibt
   verschlüsselt auf dem eigenen Kontext-Server; der Empfänger öffnet sie mit einem Code (per SMS
   oder mündlich), liest, lädt Anhänge und antwortet dort – die Antwort kommt als Mail an. Links
   laufen ab, jeder Abruf wird festgehalten. So machen es DATEV und Telekom, nur bleiben die
   Daten im Haus.

Vor dem Senden zeigt Kontext je Empfänger, welcher Weg genommen wird.

## Baustein 5: vertrauliche Unterhaltungen im Chat

Der Chat bleibt im Alltag wie er ist – geschützt durch Baustein 1, mit Suche, Benachrichtigungen
und Karten. Einzelne Direktnachrichten und Kanäle lassen sich als **vertraulich** anlegen: Dann
verschlüsselt Kontext Ende-zu-Ende mit den persönlichen Schlüsseln der Mitglieder (Baustein 2);
nicht einmal der Admin kann sie lesen. Dafür gibt es dort keine Suche, Benachrichtigungen nur als
„Neue Nachricht“, und wer neu dazukommt, sieht die Nachrichten ab dann.

## Reihenfolge

1. Grundschutz: Schloss an Mails, Prüfung in der Firmenverwaltung, Anleitung.
2. Persönliche Schlüssel und PGP: lesen, unterschreiben, verschlüsseln.
3. „Vertraulich senden“ mit dem Link für Empfänger ohne Schlüssel.
4. S/MIME für Behörden und Kanzleien.
5. Vertrauliche Unterhaltungen im Chat.
