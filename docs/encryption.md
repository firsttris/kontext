# Verschlüsselung

Wie Kontext Mails, Chat, Aufgaben und Dateien schützt – ein Konzept in Schichten. Nicht alles
muss Ende-zu-Ende verschlüsselt sein: Kontext läuft auf dem eigenen Server des Betriebs, und viele
Funktionen (Suche, Regeln, Benachrichtigungen mit Text, Aufgaben aus Mails) brauchen einen
Server, der die Inhalte lesen kann. Ende-zu-Ende gibt es dort, wo es zählt: nach außen und für
ausgewählte vertrauliche Unterhaltungen.

Stand: alle fünf Bausteine sind umgesetzt ([Roadmap](https://github.com/firsttris/kontext/blob/main/ROADMAP.md)).

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

- **Entstehen:** unter *Einstellungen → Verschlüsselung*, im Browser (OpenPGP.js, Curve25519 als
  v4-Schlüssel, den auch GnuPG und Thunderbird lesen); oder man bringt einen vorhandenen mit
  (z. B. aus Thunderbird) und importiert ihn mit seiner bisherigen Passphrase.
- **Aufbewahren:** Der geheime Teil verlässt den Browser nur verschlüsselt – mit einer
  Passphrase, die nur die Person kennt – und liegt so auf dem Kontext-Server, damit er auf allen
  Geräten da ist. Der Server kann ihn nicht öffnen. Im Browser bleibt er nach dem Entsperren nur
  im Speicher des Tabs.
- **Wiederherstellen:** Beim Anlegen gibt es einen Wiederherstellungscode zum Ausdrucken (24
  Zeichen aus Buchstaben und Ziffern, die sich nicht verwechseln lassen). Der geheime Schlüssel
  liegt zweimal auf dem Server: mit der Passphrase und mit dem Code verschlüsselt; mit dem Code
  lässt sich eine neue Passphrase setzen. Ohne beides ist der Schlüssel verloren – und mit ihm,
  was an ihn verschlüsselt war.
- **Verteilen:** Der öffentliche Teil geht mit jeder Mail von der Adresse des Schlüssels mit
  (`Autocrypt`-Kopfzeile), lässt sich herunterladen und wird per WKD gefunden: Kontext liefert
  ihn unter `/.well-known/openpgpkey/<domain>/hu/<hash>` aus – zeigt `openpgpkey.firma.de` auf den
  Kontext-Server, finden Thunderbird und andere ihn von selbst.
- **Schlüssel der anderen:** Kontext übernimmt sie beim Öffnen einer Mail aus ihrem
  `Autocrypt`-Kopf (nur für die Absenderadresse), sucht sie per WKD der Empfänger-Domain und auf
  keys.openpgp.org (vom Server aus, nur https ins Internet) und nimmt sie von Hand oder als Datei
  entgegen. Sie liegen je Person auf dem Server (`pgp_keys`), mit Herkunft und Fingerabdruck; kommt
  für eine bekannte Adresse ein anderer Schlüssel, steht das deutlich daneben.

## Baustein 3: PGP in Mails

- **Lesen:** Eine PGP/MIME-Mail (`multipart/encrypted`, RFC 3156) oder eine mit eingebettetem
  PGP zeigt „Verschlüsselt“ – in der Liste mit Schloss statt Vorschau. Nach dem Entsperren des
  eigenen Schlüssels (er bleibt bis zum Neuladen im Speicher des Tabs) lädt die App die Mail im
  Ganzen, entschlüsselt sie im Browser und zerlegt den inneren Teil (postal-mime): Text oder HTML
  (bereinigt, ohne Bilder aus dem Internet) und Anhänge zum Herunterladen.
- **Unterschriften:** Mit dem bekannten Schlüssel des Absenders geprüft – „Unterschrieben von …
  – geprüft“; passt sie nicht, eine rote Warnung; fehlt sein Schlüssel, ein Hinweis. Auch nur
  unterschriebene Mails (`multipart/signed`) werden so geprüft.
- **Senden:** Das Schloss im Fenster „Neue Mail“ verschlüsselt an alle Empfänger und an sich
  selbst (so bleibt die Kopie in „Gesendet“ lesbar) und unterschreibt. Es geht, wenn man einen
  eigenen Schlüssel für die Absenderadresse hat und für jeden Empfänger einen kennt; sonst sagt
  es, für wen einer fehlt. Die App baut die ganze Mail (Text, HTML, Anhänge) als MIME,
  verschlüsselt sie und schickt sie über Stalwart (`Email/import`, `EmailSubmission`,
  `src/jmap/send-raw.ts`) – der Server sieht nur Verschlüsseltes. „Rückgängig“ und „Später
  senden“ gelten auch hier. Entwürfe werden dabei nicht gespeichert.
- **Antworten und Weiterleiten:** Auf eine verschlüsselte Mail geht die Antwort ebenfalls
  verschlüsselt. Wurde die Mail hier geöffnet, wird ihr Text zitiert, und beim Weiterleiten gehen
  Inhalt und Anhänge mit (nie die verschlüsselten Teile); sonst sagt Kontext, dass man sie erst
  öffnen muss. Geöffnete Mails zeigen in Liste und Unterhaltung den Anfang ihres Textes statt
  „Verschlüsselt“ (`src/features/mail/opened-mails.ts`, nur im Speicher).
- **Betreff:** Er wird mitverschlüsselt (Protected Headers, wie Thunderbird es macht): Innen
  steht er im verschlüsselten Teil (`protectHeaders`, `src/lib/mime.ts`), außen nur „Vertrauliche
  Nachricht“. Sobald eine Mail geöffnet wurde, zeigen Liste, Ansicht und Antwort den echten
  Betreff. Gilt für PGP und S/MIME.
- **Grenzen:** Verschlüsselte Mails findet die Suche nur über Absender und Datum; Regeln sehen
  weder Inhalt noch Betreff.
- **Nur unterschreiben:** Im Fenster „Neue Mail“ unterschreibt „Unterschreiben“ die Mail, ohne
  sie zu verschlüsseln – lesbar für alle, aber nachweislich von einem selbst und unverändert.
  Mit dem S/MIME-Zertifikat, wenn eins für die Adresse da ist (jedes Mailprogramm prüft das
  ohne Weiteres), sonst mit dem PGP-Schlüssel (`signMail`, `smimeSignedMail`).

## Baustein 4: „Vertraulich senden“ – für alle Empfänger

Ein Schalter für Mails nach außen; Kontext nimmt je Empfänger den besten Weg:

1. **Hat einen PGP-Schlüssel** → PGP (Baustein 3).
2. **Hat ein S/MIME-Zertifikat** (häufig bei Behörden und Kanzleien) → S/MIME, verschlüsselt
   (AES-256) und unterschrieben (SHA-256), im Browser gebaut (`src/lib/smime.ts`, node-forge).
   - Das eigene Zertifikat kommt als .p12-Datei einer Zertifizierungsstelle unter Einstellungen →
     Verschlüsselung. Der Server bewahrt die Datei auf, wie sie ist – mit ihrem Passwort
     verschlüsselt, das nur der Browser bekommt (`server/smime/`). Geöffnet bleibt sie bis zum
     Neuladen, wie der PGP-Schlüssel.
   - Zertifikate anderer merkt sich Kontext aus ihren unterschriebenen Mails (nur für die Adresse
     des Absenders), oder man übernimmt sie aus einer Datei (.cer, .pem). Abgelaufene zählen nicht.
   - Eingehende S/MIME-Mails werden im Browser entschlüsselt; Unterschriften (getrennt oder
     eingepackt) werden geprüft, und die Mail sagt, wer bürgt: die ausstellende Stelle, oder
     „selbst ausgestellt“. Ob man dieser Stelle traut, entscheidet man selbst – eine Liste
     anerkannter Stellen prüft Kontext nicht.
   - Wer nur ein Zertifikat und keinen PGP-Schlüssel hat, kann an S/MIME-Empfänger vertraulich
     senden; für PGP und Links braucht es den PGP-Schlüssel.
3. **Hat nichts davon** → eine Mail mit einem Link (`/s/<id>#<schlüssel>`). Umgesetzt so:
   - Der Browser des Absenders verschlüsselt Text, HTML und Anhänge mit einem neuen AES-GCM-
     Schlüssel (`src/lib/secure.ts`). Der Schlüssel steht nur im Link hinter `#` – diesen Teil
     schickt kein Browser an einen Server; der Kontext-Server bewahrt nur Verschlüsseltes auf
     (`secure/` neben der Datenbank, `server/secure/`).
   - Zweiter Schlüssel ist ein **Code** (acht Zeichen, „K7QP-2MXR“), den der Absender nach dem
     Senden angezeigt bekommt und auf anderem Weg weitergibt (Telefon, SMS). Der Server prüft ihn
     (scrypt), fünf falsche sperren die Nachricht; ein neuer Code öffnet sie wieder.
   - Der Empfänger öffnet die Seite ohne Anmeldung, gibt den Code ein, liest, lädt Anhänge und
     antwortet dort – die Antwort wird im Browser genauso verschlüsselt.
   - Der Absender sieht unter **„Vertraulich gesendet“** (in der Mail-Seitenleiste), ob geöffnet
     und beantwortet wurde, und liest Inhalt und Antworten: Den Schlüssel jeder Nachricht
     bewahrt der Server mit dem persönlichen OpenPGP-Schlüssel des Absenders verschlüsselt auf
     (Baustein 2) – lesbar nur nach dem Entsperren. Beim ersten Öffnen und bei jeder Antwort kommt
     eine Benachrichtigung.
   - Links gelten 30 Tage, oder wie beim Senden gewählt 7 oder 90; dann löscht der Server die
     Nachricht. Zurückziehen geht jederzeit.
   - Seite und Mail an Empfänger von außen sprechen mit „Sie“ an.

Im Fenster „Neue Mail“ heißt das Schloss „Vertraulich senden“; der Hinweis daneben sagt, wie viele
Empfänger PGP, S/MIME und einen Link bekommen. Mit Links gibt es keine „Rückgängig“-Frist.

## Baustein 5: vertrauliche Unterhaltungen im Chat

Der Chat bleibt im Alltag wie er ist – geschützt durch Baustein 1, mit Suche, Benachrichtigungen
und Karten. Einzelne Direktnachrichten und Kanäle lassen sich beim Anlegen als **vertraulich**
markieren („Neue Nachricht“ → „Vertraulich – Ende-zu-Ende verschlüsselt“). Umgesetzt so:

- Jedes Mitglied braucht einen eigenen Schlüssel (Baustein 2); sonst lehnt der Server das Anlegen
  ab, ebenso das Hinzufügen von jemandem ohne Schlüssel. Eine vertrauliche Direktnachricht ist
  eine andere als die gewohnte mit denselben Leuten.
- Der Browser verschlüsselt den Text jeder Nachricht (auch Antworten im Thread und Änderungen) an
  die öffentlichen Schlüssel aller Mitglieder und unterschreibt ihn mit dem eigenen
  (`src/features/chat/confidential.tsx`, OpenPGP). Der Server nimmt in solchen Kanälen nur
  verschlüsselten Text an (`fitsConfidential`, `server/chat/chat.ts`) – nicht einmal der Admin
  kann mitlesen.
- Fotos und Dateien gehen genauso verschlüsselt hoch (`kind=sealed`); der Server kennt sie nur
  als „verschlüsselt“, ihre echten Namen und Typen stehen im verschlüsselten Text der Nachricht
  (`src/lib/sealed-chat.ts`). Kleine Vorschaubilder gibt es dort nicht, die Fotos werden (wie
  sonst auch) vor dem Hochladen verkleinert.
- **Anrufe** in einer vertraulichen Unterhaltung gehen Ende-zu-Ende verschlüsselt (LiveKit E2EE):
  Wer zuerst beitritt, macht einen zufälligen Schlüssel für den Anruf, verschlüsselt ihn an die
  Schlüssel aller Mitglieder und unterschreibt ihn (`src/features/calls/call-key.ts`). Der Server
  reicht ihn nur weiter (`sealedKey`, `server/calls/routes.ts`); die anderen nehmen ihn nur an,
  wenn ein Mitglied unterschrieben hat. Jeder Anruf bekommt einen neuen. Im Gespräch steht
  „Ende-zu-Ende verschlüsselt“, sobald LiveKit es für die eigene Seite meldet. Anrufen und
  Annehmen geht dort erst mit entsperrtem Schlüssel; Besprechungen über einen Link bleiben wie
  bisher.
- **Vertraulich weiterführen:** Eine bestehende Direktnachricht oder ein Kanal lässt sich über das
  Kanal-Menü vertraulich weiterführen. Kontext legt dafür eine neue vertrauliche Unterhaltung mit
  denselben Mitgliedern an und schreibt in die alte einen Hinweis mit Link dorthin. Der bisherige
  Verlauf bleibt, wo er ist, und unverschlüsselt; nachträglich verschlüsseln ließe er sich nicht,
  der Server kannte ihn ja schon.
- **Neuer Schlüssel eines Mitglieds:** Kontext merkt sich den Schlüssel jedes Mitglieds beim ersten
  Mal in den „Schlüsseln von anderen“ (Quelle „vertraulicher Chat“, gilt so auf jedem Gerät).
  Ist es später ein anderer, steht über der Unterhaltung, wessen Schlüssel neu ist, mit
  Fingerabdruck zum Vergleichen; erst „Neuen Schlüssel bestätigen“ nimmt ihn an. So fällt auf,
  wenn jemand einen Schlüssel unterschiebt.
- Gelesen wird nach dem Entsperren des eigenen Schlüssels; passt die Unterschrift nicht zum
  Absender, steht das unter der Nachricht.
- Dafür: keine Suche, kein Text in Benachrichtigungen und in der Kanalliste (nur „Vertrauliche
  Nachricht“), keine Karten (sie wären lesbar), Aufgaben aus einer Nachricht nur mit
  Verweis. Wer neu dazukommt, liest ab dann; frühere Nachrichten waren nicht an seinen Schlüssel
  verschlüsselt. Wer erwähnt wird, wer reagiert und wann geschrieben wurde, sieht der Server
  weiterhin.

## Reihenfolge

1. Grundschutz: Schloss an Mails, Prüfung in der Firmenverwaltung, Anleitung.
2. Persönliche Schlüssel und PGP: lesen, unterschreiben, verschlüsseln.
3. „Vertraulich senden“ mit dem Link für Empfänger ohne Schlüssel.
4. S/MIME für Behörden und Kanzleien.
5. Vertrauliche Unterhaltungen im Chat.

Alle fünf sind umgesetzt.
