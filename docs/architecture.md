# Architektur

```mermaid
flowchart LR
  Browser["Browser / Handy<br>Kontext (React-SPA)"] -->|HTTPS| Caddy
  Caddy -->|"App, /api, /jmap"| Server["Kontext-Server<br>(Bun, Hono, Better Auth)"]
  Server -->|"JMAP mit Token"| Stalwart
  Server --> SQLite[("Sitzungen, Aufgaben, Chat")]
  Caddy -->|"/rtc"| LiveKit["LiveKit<br>(Anrufe)"]
  Browser -.->|"Ton und Bild<br>UDP 7882, TCP 7881"| LiveKit
  LiveKit -->|Webhooks| Server
  Caddy -->|"/dav, /.well-known"| Stalwart
  Clients["Mailprogramme, Handys"] -->|"IMAP, SMTP, CalDAV, CardDAV"| Stalwart
  Internet["andere Mailserver"] -->|SMTP 25| Stalwart
  Stalwart --> Daten[("RocksDB-Volume")]
  Daten -->|Restic, nachts| S3[("S3 mit Object Lock")]
```

## Die Teile

- **Stalwart** (Community Edition, AGPL) ist Mail-, Kalender- und Kontaktserver in einem. Seit
  0.16 liegt die ganze Konfiguration in seiner Datenbank; auf der Platte steht nur `config.json`
  mit dem Speicherort.
- **Kontext** ist eine Single-Page-App. Sie spricht [JMAP](https://jmap.io): Mail (RFC 8621),
  Kalender (JSCalendar) und Kontakte (JSContact) über dieselbe Schnittstelle, Push über den
  Event-Stream.
- **Der Kontext-Server** (Bun, Hono, Better Auth, SQLite) liefert die App aus, kümmert sich um
  die Anmeldung und reicht JMAP an Stalwart durch. Dabei setzt er den Stalwart-Token der Sitzung
  ein; der Browser kennt weder Passwort noch Token.
- **Caddy** holt das Zertifikat und leitet alles an den Server weiter, CalDAV/CardDAV für
  Mailprogramme direkt an Stalwart.
- **LiveKit** (Apache 2.0, optional) trägt die [Anrufe](#anrufe) im Chat: ein SFU, der Ton, Bild
  und geteilte Bildschirme zwischen den Browsern verteilt.

## Gemeinsame Postfächer

Ein gemeinsames Postfach ist in Stalwart eine **Gruppe** mit eigener Adresse. Jedes Mitglied sieht
die Gruppe als zusätzliches Konto in seiner JMAP-Session (`isPersonal: false`) – mit Ordnern,
Mails und einer Absenderadresse. Kontext zeigt diese Konten unter „Postfächer“; wer dort
antwortet, schreibt automatisch als info@. Als Absendername steht dann die Person und das
Postfach, etwa „Jonas Weber (Weber Haustechnik)“ – so sieht der Kunde und im gemeinsamen
Gesendet-Ordner jeder Kollege, wer geantwortet hat.

Die Rechte am gemeinsamen Postfach:

| Stufe                | In Stalwart                                                    | In Kontext                                                   |
| -------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| **Verwalten**        | Mitglied der Gruppe                                            | alles, Senden als info@                                       |
| **Lesen und senden** | Mitglied der Gruppe (Stalwart trennt das nicht weiter)         | wie Verwalten                                                 |
| **Nur lesen**        | Ordner per `shareWith` geteilt (`mayReadItems`, `maySetSeen`) | lesen; Archivieren, Löschen, Verschieben fehlen; Antworten vom eigenen Konto |

Kontext richtet die Werkzeugleiste nach den `myRights` des Ordners. Wer keine Absenderadresse
im Postfach hat (Stalwart gibt Identitäten nur Mitgliedern), antwortet vom eigenen Konto; die
Antwort liegt dann im eigenen Gesendet-Ordner. Beide Stufen setzt die Firmenverwaltung; „Nur
lesen“ teilt dabei alle vorhandenen Ordner des Postfachs (später angelegte Ordner nicht).

### Verschieben zwischen Postfächern

„Verschieben nach …“ zeigt die Ordner aller Postfächer, nach Postfach gruppiert, das der Mail
zuerst (`src/lib/move-targets.ts`); Ordner ohne `mayAddItems` fehlen. Innerhalb eines Kontos
ändert die App `mailboxIds` (`Email/set`). In ein anderes Konto – etwa von info@ in den eigenen
Ordner „Steuerberater“ – geht es mit `Email/copy` und `onSuccessDestroyOriginal` (RFC 8620 §5.4,
RFC 8621 §4.7): Stalwart legt die Mail dort an und löscht sie hier im selben Request. Die Kopie
übernimmt Stichwörter und Datum nur, wenn man sie mitschickt; die App schickt `keywords` und
`receivedAt` mit, damit gelesen und markiert erhalten bleiben.

Mit der Maus geht dasselbe: eine Zeile der Liste auf einen Ordner oder ein Postfach in der
Seitenleiste ziehen (`src/features/mail/mail-drag.ts`, HTML-Drag-and-Drop). Ziehen lassen sich
nur Mails aus Ordnern mit `mayRemoveItems`; auf dem Handy bleibt das Menü.

Damit man sieht, wo eine Mail liegt, steht über dem Betreff „Gemeinsames Postfach info@…“ (bei
übergebenen Postfächern „Übergebenes Postfach …“), das Etikett in „Alle Posteingänge“ trägt das
Gruppen-Symbol, und die Seitenleiste nennt die Ordner eines gemeinsamen Postfachs „Ordner von
info@“.

## Bilder aus dem Internet

Bilder aus dem Internet verraten dem Absender, dass die Mail geöffnet wurde. Die Mail zeigt sie
erst auf Wunsch („Laden“); „Immer von …“ merkt sich den Absender auf dem Kontext-Server
(`image_senders`, `/api/image-senders`, je Person auf allen Geräten). Erlaubt werden Adressen,
ganze Domains (`@firma.de`) und auf Wunsch alle Absender aus den eigenen Kontakten
(`@contacts`), in den Einstellungen unter „Passwort und Sicherheit“. Sofort geladen wird nur, wenn
die Mail wirklich vom Absender kommt (`src/lib/remote-images.ts`): Eine Mail von außen muss für
dessen Domain bestätigt sein (DMARC, oder SPF/DKIM passend); eine ohne jede Prüfung
(importiert, von Kolleginnen) zählt mit, eine durchgefallene nie – ein gefälschter Absender
schaltet keine Bilder frei.

## Lesebestätigung

Stalwart kennt JMAP-MDN (RFC 9007) nicht; Kontext baut Lesebestätigungen nach RFC 8098 selbst
(`src/lib/mdn.ts`, `src/features/mail/receipts.tsx`):

- **Anfordern:** Der Schalter mit dem Häkchen-Brief im Fenster „Neue Mail“ setzt
  `Disposition-Notification-To` auf die eigene Adresse.
- **Beantworten:** Eine Mail mit der Bitte zeigt „… bittet um eine Lesebestätigung“ mit
  „Senden“ und „Nicht senden“ – nie von selbst. Die App baut die Bestätigung als
  `multipart/report` (ein Satz für Menschen, `message/disposition-notification` für Programme,
  `In-Reply-To` auf die Mail), legt sie per `Email/import` in „Gesendet“ und verschickt sie von der
  Adresse, an die die Mail ging. Beides setzt `$MDNSent` (RFC 3503), danach fragt keiner mehr –
  Stalwart gibt Schlagworte klein zurück, verglichen wird ohne Groß und Klein.
- **Sehen:** Eine gesendete Mail mit der Bitte zeigt „Gelesen von … · Zeit“. Stalwart durchsucht
  `In-Reply-To` nicht; gesucht wird nach dem Betreff, behalten wird, was eine Bestätigung ist
  und auf genau diese Mail zeigt. Die Bestätigungen selbst liegen als Mails im Posteingang.

## Newsletter abbestellen

Hat eine Mail `List-Unsubscribe` (RFC 2369), steht neben „Details anzeigen“ „Abbestellen“
(`src/features/mail/unsubscribe.tsx`, Weg: `server/unsubscribe/unsubscribe.ts`):

- **Mit einem Klick** (RFC 8058: eine https-Adresse und `List-Unsubscribe-Post:
  List-Unsubscribe=One-Click`): Der Kontext-Server schickt das POST, weil der Browser nicht an
  fremde Seiten posten darf (`/api/unsubscribe`). Die Adresse liest er selbst aus der Mail, mit
  dem Zugang der angemeldeten Person – niemand kann ihn so auf andere Adressen ansetzen. Nur
  https, nur Adressen im Internet (keine aus internen Netzen, `private-address.ts`), ein Versuch,
  keine Weiterleitungen, zehn Sekunden.
- **Per Mail** (`mailto:`): Die App schickt die Abmelde-Mail von der Adresse, an die der
  Newsletter ging (info@ für den Newsletter an info@), mit Betreff und Text aus dem Link.
- **Auf der Webseite:** Sie öffnet sich in einem neuen Tab.

Danach trägt die Mail das Schlagwort `kontext.unsubscribed` („Abbestellt“) und kann auf Wunsch
gleich in den Papierkorb.

## Prüfung des Absenders

Kommt eine Mail aus dem Internet an (Port 25), prüft Stalwart den Absender und schreibt das
Ergebnis als `Authentication-Results` (RFC 8601) oben in die Mail, dazu `X-Spam-Score`
(`crates/smtp/src/inbound/data.rs`, `crates/spam-filter/src/analysis/score.rs`). Die App holt diese
Header mit `header:…:asText:all` und nimmt jeweils den **obersten**: Ohne `:all` gäbe JMAP den
untersten zurück (RFC 8621 §4.1.3), und alles unter Stalwarts Header kam mit der Mail und kann
vom Absender gefälscht sein. Mails ohne diesen Header kamen nicht von außen (von Kollegen über
den eigenen Server, oder aus einem Umzug); sie werden nicht bewertet.

Die Regeln stehen in `src/lib/sender-check.ts`:

| Warnung                                           | Wann                                                                                                   |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| „gibt sich als Absender aus weber-haustechnik.de aus“ | Absender aus der eigenen Firma (Domain eines eigenen Postfachs), aber von außen und nicht bestätigt |
| „Absender nicht bestätigt“                        | DMARC fehlgeschlagen, oder SPF hart fehlgeschlagen ohne gültige DKIM-Signatur                          |
| „Antworten gehen an …“                            | `Reply-To` zeigt auf eine andere Domain als der Absender – ein Muster bei Rechnungsbetrug              |

Bestätigt ist ein Absender, wenn DMARC bestanden hat oder SPF bzw. DKIM für seine Domain (auch
Subdomain, RFC 7489 §3.1). Ein SPF-„softfail“ allein warnt nicht, weil weitergeleitete Mails das
oft haben; „nicht eingerichtet“ ist bei kleinen Firmen häufig und steht nur in den Details.

„Als Spam markieren“ (`!`) verschiebt die Mail in den Spam-Ordner und setzt `$junk`, „Kein Spam“
holt sie in den Posteingang und setzt `$notjunk` (IANA-Stichwörter, RFC 8621 §2). Stalwart lernt
aus beidem, aus dem Verschieben und aus dem Stichwort (`crates/jmap/src/email/set.rs`).

„Details anzeigen“ unter dem Absender klappt Absender, Empfänger, Antwort an, Datum, Größe,
Anhänge und Nachrichten-ID auf, daneben die einzelnen Prüfungen (SPF, DKIM, DMARC, Reverse DNS)
und die Spam-Bewertung (`src/features/mail/message-details.tsx`).

## Firmenverwaltung

Unter *Einstellungen → Firma* verwaltet der Chef Mitarbeiter und gemeinsame Postfächer. Das läuft
nicht über JMAP mit dem Token der Sitzung, sondern über den Kontext-Server (`/api/company`,
`server/company/`): Er spricht Stalwarts Verwaltungsobjekte (`x:Account`, `x:Role`, `x:Domain`)
mit einem eigenen API-Schlüssel an und erlaubt nur, was die Firmenverwaltung braucht.

- **Wer darf:** Konten mit der Stalwart-Rolle `Firmenverwaltung (Kontext)` zusätzlich zur Rolle
  *User*. Die Rolle hat keine Rechte in Stalwart, sie ist nur die Markierung; Kontext legt sie
  beim ersten Aufruf an. Das eigene Konto kann sich das Recht nicht selbst nehmen und sich nicht
  sperren.
- **Wen es zeigt:** Benutzer mit der Rolle *User* (mit oder ohne Markierung) und Gruppen mit der
  Standardrolle. Stalwarts Admins und Konten mit anderen Rollen bleiben beim Betreiber.
- **Anlegen:** Kontext erzeugt ein Startpasswort (vier Vierergruppen ohne verwechselbare
  Zeichen, 80 Bit) und zeigt es einmal an. Neue Konten bekommen Deutsch und Europe/Berlin.
- **Sperren** nimmt dem Konto das Recht `authenticate`: keine Anmeldung mehr in Kontext, IMAP,
  SMTP oder DAV, Mails an die Adresse kommen aber weiter an. Kontext beendet dazu alle Sitzungen
  der Person, ebenso nach einem neuen Passwort.
- **Weitere Adressen** sind Stalwarts Aliase (`aliases`), nur in den Domains des Servers.
- **Gemeinsame Postfächer** sind Gruppen; Mitglied ist, wer die Gruppe in `memberGroupIds` hat.
  „Nur lesen“ bekommt, wem alle Ordner des Postfachs per `shareWith` geteilt sind
  (`mayReadItems`, `maySetSeen`); die App liest das am Posteingang ab.
- **Abwesenheit** eines Mitarbeiters (etwa bei Krankheit) ist dessen `VacationResponse`; die
  Vertretung steht als eigene Zeile in der Nachricht. Hat er Regeln, läuft sie in deren Skript
  (siehe [Regeln](#regeln)); der Server nimmt dafür denselben Code wie die App.

- **Firmen-Signatur:** eine Vorlage mit `[Name]` und `[E-Mail]`, gespeichert in der
  SQLite-Datenbank von Kontext (`company_setting`). „Für alle übernehmen“ schreibt sie in jede Absenderadresse
  (`Identity`) aller aktiven Mitarbeiter, ausgefüllt mit Name und Adresse der Identität; neue
  Mitarbeiter bekommen sie beim Anlegen.
- **Austritt:** Zugang sperren, das Postfach einer Kollegin übergeben (alle Ordner per
  `shareWith` mit allen Rechten außer Teilen), neue Mails weiterleiten und einmal am Tag
  automatisch antworten. Weiterleitung und Antwort sind ein Sieve-Skript
  (`kontext-austritt`, `redirect` und `vacation`), weil Stalwart nur ein aktives Skript pro
  Konto ausführt; es ersetzt dabei Abwesenheitsnotiz und Regeln, bis der Zugang wieder
  freigegeben wird (siehe [Regeln](#regeln)). Gelöscht wird nichts.
- In der Mail zeigt Kontext übergebene Postfächer unter „Postfächer“ wie gemeinsame: als
  Postfach zählt ein fremdes Konto, wenn es eine Gruppe ist oder Ordner zeigt (wer nur einen
  Kalender teilt, zeigt keine).

Für Ordner, Abwesenheit, Signaturen und Sieve arbeitet der Server per JMAP *im Konto* des Mitarbeiters bzw. der
Gruppe. Das erlaubt Stalwart mit dem Recht `impersonate`: dann gilt der Schlüssel als Mitglied
jedes Kontos (`AccessToken::is_member`). `server/company/management.ts` spricht die
Verwaltungsobjekte an, `server/company/mailstore.ts` die Konten.

Stalwart lässt den Schlüssel keine Rollen oder Rechte vergeben, die er nicht selbst hat. Die
Rolle des Server-Kontos erbt deshalb *User* (sonst könnte es niemandem die Rolle *User* geben)
und hat dazu nur die Rechte für Konten, Rollen und Domains (siehe [Installation](installation.md)).

## Umzug

Unter *Einstellungen → Firma → Umzug* holt der Chef die Daten eines Mitarbeiters aus dem alten
System, auf zwei Wegen. Beide schreiben mit dem Server-Schlüssel in das neue Postfach
(`server/migration/importer.ts`) und überspringen Doppeltes: Mails mit bekannter Message-ID,
Kontakte mit gleichem Namen und gleicher erster Adresse, Termine mit bekannter UID. Ein Umzug
lässt sich deshalb gefahrlos wiederholen.

**Kategorien** kommen mit (`server/migration/categories.ts`): aus Microsoft 365 die Outlook-
Kategorien der Mails, mit der Farbe aus `masterCategories` (dafür braucht die App zusätzlich
`MailboxSettings.Read`; ohne bekommen sie eigene Farben); per IMAP die Schlagworte, Thunderbirds
`$label1`–`$label5` unter ihren deutschen Namen („Wichtig“, „Arbeit“, …). Fehlt eine Kategorie im
neuen Postfach, wird sie angelegt. Aus Outlook-Dateien (PST) nicht: `readpst` schreibt Kategorien
nur für Kontakte und Termine aus, nicht für Mails.

### Postfach verbinden per IMAP (Gmail, GMX, WEB.DE, Telekom, IONOS, STRATO, eigener Server)

Kontext liest das alte Postfach per IMAP (`imapflow`), nur lesend, und gleicht es in eine Richtung
ab: der erste Lauf holt alles, danach alle 15 Minuten das Neue, bis der Chef den Umzug abschließt.
So läuft das alte Postfach parallel weiter, solange Absender noch die alte Adresse nutzen.

- **Anmeldung**: Adresse und Passwort – bei Gmail ein App-Passwort (Bestätigung in zwei Schritten
  nötig). Kontext prüft die Anmeldung sofort und speichert das Passwort verschlüsselt (AES-GCM mit
  dem Server-Geheimnis, wie die Stalwart-Tokens). Lehnt der Anbieter es später ab, steht der Umzug
  auf „Anmeldung abgelehnt“, bis ein neues Passwort eingetragen ist. Beim Abschließen wird es
  gelöscht.
- **Ordner** nach ihrer besonderen Verwendung (RFC 6154), also in jeder Sprache: Posteingang,
  Gesendet, Entwürfe, Archiv auf die Standardordner. Gmails Labels werden Ordner; eine Mail mit
  mehreren Labels kommt **einmal** ins Postfach und liegt in allen passenden Ordnern (JMAP erlaubt
  mehrere `mailboxIds`). „Alle Nachrichten“, „Wichtig“, „Markiert“, Spam und Papierkorb bleiben weg;
  markierte Mails sind über `$flagged` markiert.
- **Stand**: pro Ordner `UIDVALIDITY` und die letzte übernommene UID (RFC 9051) in SQLite
  (`mail_sync`); ein Lauf holt nur höhere UIDs. Ändert sich `UIDVALIDITY`, beginnt der Ordner von
  vorn – Doppeltes fällt durch die Message-ID heraus.
- **Grenzen**: Gmail gibt per IMAP etwa 2,5 GB am Tag heraus; ein großes Postfach braucht
  mehrere Tage, der Abgleich macht von selbst weiter. Bei „Anderer Server“ sind nur die IMAP-Ports
  993 (TLS) und 143 (STARTTLS) erlaubt.
- **Nicht dabei**: Senden als alte Adresse und ein Abgleich in beide Richtungen. Wer die alte
  Adresse dauerhaft behalten will, verbindet sie selbst als [weiteres Postfach](#weitere-postfacher).
  Kontakte und Kalender kommen bei Gmail über den Google-Export (siehe unten).

Den Abgleich eines Ordners teilen sich Umzug und weitere Postfächer
(`server/migration/folder-sync.ts`).

### Microsoft 365

Für Microsoft 365 gibt es kein IMAP mit Passwort mehr; Kontext liest über Microsoft Graph mit
einer App, die der Admin des Kunden einmal in seinem Mandanten registriert und freigibt
(Anwendungsberechtigungen `Mail.Read`, `Contacts.Read`, `Calendars.Read`, `User.Read.All`,
optional `MailboxSettings.Read` für die Farben der Kategorien,
Token per Client Credentials). Die Zugangsdaten liegen verschlüsselt in der SQLite-Datenbank von Kontext
(`company_setting`); danach ordnet der Chef pro Mitarbeiter ein Postfach aus dem Mandanten zu
(vorgeschlagen wird das mit gleichem Namen vor dem @). `server/migration/m365/`:

- **Mails** pro Ordner mit Graphs Delta-Abfrage (`messages/delta`); der Delta-Link steht im
  Stand des Umzugs, ein späterer Lauf holt nur das Neue. Jede neue Mail kommt als MIME
  (`messages/{id}/$value`) per `Email/import` in denselben Ordner, mit Gelesen und Markierung.
  Die Standardordner erkennt Kontext an Graphs festen Namen (`inbox`, `sentitems`, `drafts`,
  `archive` – in jeder Sprache); Gelöschte Elemente, Junk-E-Mail, Postausgang und ähnliche
  bleiben weg.
- **Kontakte** des Standardordners werden JSContact, **Termine** JSCalendar, Serien mit ihrer
  Regel (`recurrence` → `recurrenceRule`), in deutscher Zeit gelesen
  (`Prefer: outlook.timezone="W. Europe Standard Time"`). Einzeln geänderte Termine einer Serie
  kommen noch nicht mit, nur die Serie.
- Drosselt Graph (429), wartet Kontext die angegebene Zeit und versucht es erneut.

Für Entwicklung und Tests spielt `dev/fake-graph.ts` Microsofts Anmeldung und Graph
(`M365_LOGIN_URL`, `GRAPH_URL`).

### Datei hochladen (Outlook-PST, Kontakte als vCard, Kalender als iCalendar)

Die App schickt die Datei in Stücken zu 8 MB (`PUT /api/company/migrations/:id/file`); bricht
die Verbindung ab, sagt der Server, wie viel er hat. Danach arbeitet der Server die Umzüge
nacheinander ab (`server/migration/runner.ts`), auch nach einem Neustart:

1. **PST**: `readpst` (libpst) zerlegt die Datei in eine Datei pro Mail, Kontakt und Termin, mit
   einem Verzeichnis pro Outlook-Ordner (ohne parallele Worker: mit ihnen endet readpst manchmal,
   bevor alle Dateien geschrieben sind). Posteingang, Gesendete Elemente, Gelöschte Elemente,
   Entwürfe, Junk-E-Mail und Archiv (deutsch oder englisch) landen in den Standardordnern, alles
   andere unter demselben Pfad; Aufgaben und Notizen bleiben weg.
2. **Mails** gehen mit `Email/import` (RFC 8621) in den passenden Ordner, mit Originaldatum und
   Gelesen-Status; bis zu 25 Mails und 6 MB pro Request, die Blobs per `Blob/upload` im selben
   Request, größere Mails einzeln über den Upload.
3. **Kontakte** (`.vcf`, auch Googles Export mit vielen Karten) und **Termine** (`.ics`, eine
   Datei mit vielen Terminen) liest Stalwart selbst (`ContactCard/parse`, `CalendarEvent/parse`);
   sie kommen ins Standard-Adressbuch bzw. den Standardkalender. readpst nummeriert Termine nur
   („0x1268“); dann bildet Kontext die UID aus dem Inhalt.

Der Fortschritt steht in SQLite (`migration_job`); die Datei liegt bis zum Ende neben der
Datenbank unter `migrations/` und wird nach einem erfolgreichen Umzug gelöscht.

## Weitere Postfächer

Unter *Einstellungen → Weitere Postfächer* verbindet jede Person ihre anderen Adressen (Gmail, GMX,
WEB.DE, Telekom, IONOS, STRATO, 1&1 oder ein eigener Server), um sie dauerhaft aus Kontext zu
nutzen – anders als der [Umzug](#umzug), den der Chef für einen Wechsel einrichtet.
`server/external/`, Tabelle `external_account`, Routen unter `/api/external-accounts` (nur die
eigenen Konten, erkannt am persönlichen Konto der JMAP-Session).

Stalwart ist ein Mailserver, kein Mailprogramm: Es holt keine fremden Postfächer ab, und eine Mail
„von @gmail.com“ darf nicht über den eigenen Server hinaus, sonst scheitert sie beim Empfänger an
SPF und DMARC. Beides macht deshalb der Kontext-Server:

- **Empfangen** (`fetcher.ts`): alle zwei Minuten (oder „Jetzt abrufen“) der Posteingang des
  Anbieters per IMAP, nur lesend, mit demselben Ordner-Abgleich wie der Umzug. Geholt wird nur, was
  nach dem Verbinden ankommt – auf Wunsch auch der jetzige Posteingang. Die Mails landen per
  `Email/import` (Server-Schlüssel) im Posteingang oder in einem eigenen Ordner mit der Adresse als
  Namen; Doppeltes fällt über die Message-ID heraus. Verglichen wird mit den Mails ab einem Tag
  vor der ältesten neuen, nicht mit dem ganzen Konto (`Email/query` mit `after`; eine Suche nach
  der Message-ID bräuchte Stalwarts Header-Index, der ab Werk aus ist). Beim ersten Lauf und wenn
  der Anbieter den Posteingang neu aufgebaut hat (neue `UIDVALIDITY`, alle Mails erscheinen
  wieder), vergleicht Kontext mit dem ganzen Konto. Mails und Push erscheinen wie jede
  andere Mail, auch auf dem Handy und im Mailprogramm.
- **Kontext führt**: Gelesen, Verschieben und Löschen bleiben in Kontext; beim Anbieter wird nichts
  geändert oder gelöscht. Damit entfällt ein Abgleich in beide Richtungen; wer zurück will, nimmt
  beim Anbieter alles mit.
- **Senden** (`send.ts`): Im Fenster „Neue Mail“ stehen die Adressen unter „Von“ (Kennung
  `external:<id>`, mit der Signatur der eigenen Adresse); beim Antworten wird die Adresse gewählt,
  an die die Mail ging. Die App legt die Mail wie sonst als Entwurf ab und ruft
  `POST /api/external-accounts/:id/send` auf. Der Server liest sie mit dem Token der Sitzung,
  prüft, dass „Von“ die Adresse des Kontos ist, nimmt den `Bcc`-Header heraus (RFC 5322 §3.6.3),
  liefert sie beim SMTP-Server des Anbieters ein (465 mit TLS oder 587 mit STARTTLS, nodemailer,
  `smtp.ts`) und legt sie danach unter Gesendet ab. Lehnt der Anbieter einzelne Empfänger ab und
  nimmt die anderen an, gilt die Mail als gesendet (sie ist bei den anderen angekommen, ein
  zweites Senden käme dort doppelt an); die App nennt die abgelehnten Adressen. Gmail legt selbst eine Kopie in seinen
  Gesendet-Ordner, die anderen nicht.
- **Anmeldung**: Adresse und (App-)Passwort; Kontext prüft beim Verbinden IMAP und SMTP und
  speichert das Passwort verschlüsselt (AES-GCM mit dem Server-Geheimnis). Bei „Anderer Server“
  nur IMAP 993/143 und SMTP 465/587.
- **Grenzen**: Rückgängig, „Später senden“, Verschlüsseln und Unterschreiben gehen über ein weiteres Postfach noch
  nicht (der Server sendet sofort); Lesebestätigungen und Abmelde-Mails gehen weiter von der
  eigenen Adresse. Senden als diese Adresse geht nur in Kontext, nicht aus Thunderbird oder der
  Mail-App des Handys, die direkt an Stalwart hängen. Gmail per OAuth („Mit Google anmelden“)
  bräuchte Googles Prüfung der App; bis dahin ein App-Passwort. Regeln laufen in Stalwart beim
  Eingang per SMTP, abgeholte Mails durchlaufen sie nicht.

Ohne Stalwart-Schlüssel (`STALWART_ADMIN_KEY`) gibt es die Funktion nicht; der Eintrag in den
Einstellungen fehlt dann (die Route fehlt, der Server antwortet mit 404 oder, mit `STATIC_DIR`,
mit der `index.html` der App – beides heißt für die App „nicht angeboten“). Das Fenster „Neue
Mail“ wählt den Absender erst, wenn auch die weiteren Postfächer geladen sind.

## Regeln

Regeln sortieren neue Mails beim Eingang, auf dem Server: Kontext schreibt sie als **ein
Sieve-Skript** (`kontext-regeln`, RFC 5228) und lädt es per JMAP (`SieveScript/set`, RFC 9661)
ins eigene Konto. So wirken sie auch, wenn niemand angemeldet ist, und gleich auf jedem Gerät.

- **Bedingungen:** Absender (`address "from"`), Empfänger (`address ["to", "cc"]`), Betreff
  (`header`), Text (`body :text`), je mit „enthält“, „enthält nicht“ oder „ist genau“; alle oder
  eine davon.
- **Aktionen:** in einen Ordner (`fileinto :mailboxid`, mit dem Pfad als Ersatz, falls die Id
  fehlt), als gelesen markieren oder markieren (`addflag`), weiterleiten mit Kopie
  (`redirect :copy`; Stalwart leitet eine Mail höchstens einmal weiter), keine weiteren Regeln,
  **Aufgabe anlegen**: Das Skript setzt das Schlagwort `kontext.task`; der Kontext-Server sucht
  jede Minute in allen Postfächern, in die jemand Angemeldetes schreiben darf, nach so markierten
  Mails, nimmt die Markierung weg und legt die Aufgabe an – auf dem Board des Postfachs, verknüpft
  mit der Mail, im eigenen Postfach für die Inhaberin (`server/tasks/from-rules.ts`). Auf
  vorhandene Mails angewendet entsteht keine Aufgabe, wie auch nichts weitergeleitet wird.
- **Reihenfolge:** Alle passenden Regeln wirken von oben nach unten; der **erste Ordner
  gewinnt**, damit eine Mail nicht als Kopie in mehreren Ordnern landet. Das Skript merkt sich
  Ordner und „fertig“ in Variablen (RFC 5229) und legt am Ende einmal ab.
- **Spam** verlässt das Skript vorher (`spamtest :percent` ≥ 50, wie Stalwarts Grenze): Stalwart
  legt eine Mail nur in „Junk“, wenn das Skript sie nirgends abgelegt hat (`is_spam &&
  !did_file_into`, `crates/email/src/sieve/ingest.rs`).
- **Abwesenheit:** Stalwart führt nur ein aktives Skript pro Konto aus, und `VacationResponse`
  ist selbst eines (`vacation`, `crates/jmap/src/vacation/set.rs`), das beim Einschalten alle
  anderen abschaltet. Darum gilt (`server/rules/filters.ts`, von App und Server genutzt):
  ohne Regeln bleibt alles bei `VacationResponse`; mit Regeln bleibt `VacationResponse` „aus“,
  behält Text und Zeitraum, und das Regel-Skript bindet es mit
  `include :personal :optional "vacation"` ein. Ob die Abwesenheit an ist, steht dann im
  Regel-Skript.
- **Gespeichert** werden die Regeln als JSON in einer Kommentarzeile des Skripts
  (`# kontext:{…}`); die App liest nur diese Zeile, nie Sieve. Nutzertexte werden für Sieve
  maskiert, auch `${`, das sonst als Variable gelesen würde.
- **Eigenes Postfach:** in den Einstellungen; „Regel erstellen …“ an einer Mail im eigenen
  Postfach füllt den Absender vor.
- **Gemeinsame Postfächer** (info@, rechnung@): Stalwart führt bei der Zustellung das aktive
  Skript des Empfängerkontos aus, also auch das der Gruppe (`crates/email/src/message/
  delivery.rs`). Der Chef pflegt die Regeln in der Firmenverwaltung („Regeln“ am Postfach); der
  Server schreibt sie mit seinem Schlüssel ins Gruppenkonto (`/api/company/mailboxes/:id/rules`),
  mit demselben Code wie die App.
- **Auf vorhandene Mails anwenden** (Häkchen im Dialog): Die gespeicherte Regel läuft einmal
  über die neuesten 1.000 Mails im Posteingang, mit derselben Logik wie das Skript
  (`server/rules/match.ts`: Teiltext ohne Groß/Klein, erster Ordner gewinnt, „keine weiteren
  Regeln“), und verschiebt und markiert per `Email/set`. Weitergeleitet wird dabei nichts.
  Unterschied: Sieve vergleicht Groß/Klein nur bei ASCII (`i;ascii-casemap`), die App auch bei
  Umlauten.
- **Austritt:** Er aktiviert `kontext-austritt`. Solange das läuft, aktiviert Kontext weder
  Regeln noch Abwesenheit; die Firmenverwaltung sagt bei „Abwesenheit eintragen“, dass die
  Person ausgetreten ist. Wird der Zugang wieder freigegeben, endet der Austritt: das Skript
  wird abgeschaltet, Regeln und Abwesenheit laufen wieder wie gespeichert.

## Kategorien

Farbige Markierungen an Mails, mehrere je Mail, neben dem einen Ordner, in dem sie liegt. Eine
Mail kann damit gleichzeitig „Angebot“ und „Wartet auf Antwort“ sein, ohne doppelt in zwei Ordnern
zu liegen wie bei Gmails Labels.

- **An der Mail** ist eine Kategorie ein JMAP-Keyword (RFC 8621 §4.1.1, in IMAP ein Flag), lesbar
  geschrieben wie `wartet-auf-antwort`. Thunderbird zeigt sie als Schlagwort; Handy-Apps
  übergehen eigene Keywords.
- **Name, Farbe und Reihenfolge** gehören zum Postfach und liegen in der SQLite-Datenbank von Kontext
  (`mail_categories`), weil Stalwart dafür keinen Platz hat. Ohne eigene Liste gelten „In
  Bearbeitung“, „Wartet auf Antwort“ und „Erledigt“. `/api/categories` liefert die Kategorien
  aller Postfächer der angemeldeten Person; wer welches Postfach öffnen darf, sagt Stalwarts
  JMAP-Session mit ihrem Token, ändern darf, wer nicht nur lesen darf.
- **Umbenennen** behält das Keyword, die Mails behalten also ihre Kategorie. Entfernen blendet
  sie nur aus; das Keyword bleibt an den Mails.
- **Gemeinsame Postfächer:** Kategorien an einer Mail in info@ sehen alle Mitglieder. So wird
  info@ zur kleinen Aufgabenliste („In Bearbeitung“ → „Erledigt“).
- **Setzen** im Menü „Kategorie“ der Mail (mehrere nacheinander, das Menü bleibt offen);
  **finden** über die Seitenleiste, die `in:info@ kategorie:"…"` sucht, oder per
  `kategorie:`/`label:` in der Suche; **automatisch** per Regel („Kategorie setzen“: Sieve
  `addflag "<keyword>"`).

## App (PWA)

Kontext lässt sich als App installieren (Chrome, Edge, Safari, Android, iPhone): eigenes Fenster,
Symbol, Kurzbefehle (Neue Mail, Kalender, Kontakte). Gebaut mit `vite-plugin-pwa` und Workbox;
das Manifest steht in `vite.config.ts`, der Service Worker in `src/sw/service-worker.ts`.

- **Updates kommen sicher an.** Der Server liefert `service-worker.js`, `index.html` und das
  Manifest immer mit `cache-control: no-cache`, die Bausteine unter `/assets/` mit Hash im Namen
  dauerhaft. Jeder Build ist ein neuer Worker mit einer neuen Liste der Dateien und ihrer Hashes;
  Workbox lädt nur Geändertes und räumt den alten Cache weg (`cleanupOutdatedCaches`). Die App
  fragt stündlich und jedes Mal, wenn sie wieder in den Vordergrund kommt, nach einer neuen
  Version (`src/pwa/pwa-status.tsx`).
- **Neu laden auf Wunsch.** Eine neue Version wartet und meldet sich mit „Eine neue Version von
  Kontext ist da – Neu laden“; sie übernimmt erst nach dem Klick, damit eine angefangene Mail
  nicht verloren geht. Sind alle Fenster zu, startet beim nächsten Öffnen ohnehin die neue.
- **Was gecacht wird:** nur die App selbst (HTML, Skripte, Styles, Schriften, Symbole). Mails,
  Kalender und Anmeldung (`/jmap`, `/api`) gehen nie über einen Cache. Ohne Netz startet die App
  und sagt „Keine Verbindung“; neue Daten kommen, sobald das Gerät wieder online ist.
- **Als Mailprogramm:** `mailto:`-Links öffnen eine neue Mail in Kontext – in der installierten
  App über das Manifest (`protocol_handlers`), im Browser über *Einstellungen → Darstellung →
  Als Mailprogramm verwenden* (`registerProtocolHandler`). `/compose?mailto=…` wertet Empfänger,
  Cc, Betreff und Text aus (`src/lib/mailto.ts`, RFC 6068).
- **Teilen in Kontext:** Auf dem Handy erscheint Kontext im Teilen-Menü anderer Apps (Web Share
  Target). Der Service Worker nimmt Fotos, Dateien, Texte und Links an, legt sie kurz in einem
  eigenen Cache ab und öffnet eine neue Mail damit; die Dateien sind dann schon Anhänge.
- **Benachrichtigungen** gehen über den Service Worker (`showNotification`), weil installierte Apps
  auf Android nur so dürfen; ein Klick öffnet die Mail oder den Termin, auch bei geschlossenem
  Fenster. Sie kommen, solange Kontext geöffnet ist (auch im Hintergrund); bei ganz geschlossener
  App braucht es Web Push; Stalwart kann ihn selbst senden (`urn:ietf:params:jmap:webpush-vapid`), siehe [Roadmap](https://github.com/firsttris/kontext/blob/main/ROADMAP.md).
- **Ungelesen-Zahl am App-Symbol** (Badging API) als Summe aller Posteingänge.

## Aufgaben

Aufgaben (`src/features/tasks/`, Server `server/tasks/`) liegen in Kontexts SQLite (`tasks`,
`task_links`): Stalwart kennt Aufgaben nur als CalDAV-VTODO, ohne Verknüpfung zu Mails, Spalten
oder Reihenfolge.

- **Wem sie gehören:** Jede Aufgabe gehört zu einem Konto – dem eigenen Postfach oder einem
  gemeinsamen wie info@. `/api/tasks` liefert alle Aufgaben der Konten in der JMAP-Session der
  angemeldeten Person; anlegen, ändern und löschen darf, wer das Postfach nicht nur lesen darf.
  Wer eine Aufgabe zugewiesen bekommt, sieht und ändert sie auch auf dem eigenen Board einer
  Kollegin; verschieben und löschen darf dort nur sie. Erledigtes bleibt 30 Tage in den Listen.
- **Ansichten:** „Meine Aufgaben“ sind mir zugewiesene und die im eigenen Postfach ohne
  Zuständigen; „Heute“ nimmt Überfälliges mit, heute Erledigtes bleibt durchgestrichen stehen. Ein
  Board pro Postfach mit den Spalten Offen, In Arbeit, Wartet, Erledigt (`status`); die
  Reihenfolge ist `position`, beim Ziehen wird zwischen die Nachbarn gesetzt.
- **Eigene Spalten:** „Spalten“ am Board benennt um, ergänzt (bis zehn), verschiebt und löscht
  (`task_boards`, JSON). „Offen“ bleibt vorn, „Erledigt“ hinten, nur „Erledigt“ zählt als fertig;
  eigene Spalten heißen `c-…`. Aufgaben einer gelöschten Spalte und Aufgaben, die auf ein Board
  ohne ihre Spalte wandern, landen in „Offen“.
- **Wiederholen:** täglich, an Werktagen, wöchentlich, monatlich, jährlich (`repeat`). Erledigt,
  legt der Server sofort die nächste an – offen, Schritte nicht abgehakt, fällig am nächsten Tag
  nach der alten Fälligkeit, aber nie in der Vergangenheit (`nextDue`); die Erinnerung behält
  ihren Abstand in Ortszeit. Die erledigte wiederholt sich danach nicht mehr, so entsteht beim
  Wiederöffnen keine doppelte.
- **Aus einer Mail:** „Aufgabe“ in der Werkzeugleiste (Taste `t`): Titel aus dem Betreff ohne
  „AW:/Re:“, verknüpft mit der Mail und ihrer Unterhaltung (`threadId`), auf Wunsch wird die
  Mail danach archiviert (merkt sich der Browser). Die Mail zeigt ihre Aufgabe in Liste und
  Lesebereich.
- **Aus mehreren Mails:** „Aufgaben erstellen“ in der Leiste der Auswahl macht eine Aufgabe pro
  Mail, mit gemeinsamem Tag, Zuständigem und Board. Hat die andere Seite der Mail eine
  Kontaktkarte, wird sie mitverknüpft (auch bei einer einzelnen Mail).
- **Am Kontakt:** die Aufgaben, die mit der Karte verknüpft sind oder mit einer Unterhaltung der
  letzten Mails mit der Person (`src/lib/task-context.ts`); „Aufgabe“ legt eine verknüpfte an.
- **Im Kalender:** meine offenen Aufgaben am Tag ihrer Fälligkeit, Überfälliges auf heute, in Rot;
  in Woche und Tag bei den ganztägigen Terminen. Abhaken mit „Rückgängig“; unter „Meine Kalender“
  ausblendbar (merkt sich der Browser wie ausgeblendete Kalender).
- **In der Glocke:** „Neu für dich“ – was mir jemand anderes in den letzten 7 Tagen zugewiesen hat
  (`assigned_by`, `assigned_at`; ungesehene zählen zum Punkt an der Glocke) – und „Fällige
  Aufgaben“ von heute und davor.
- **Push:** Wer eine Aufgabe jemand anderem zuweist, schickt ihr eine Benachrichtigung. Eine
  Erinnerung (`remind_at`, „Erinnern“ in der Aufgabe: zur Fälligkeit, 15 Minuten oder eine Stunde
  vorher, am Morgen, am Vortag, oder frei) verschickt der Server jede Minute
  (`server/tasks/notices.ts`, `REMINDER_TICK_MS`) an die zuständige Person, ohne Zuständige an
  die, die sie angelegt hat – auch bei geschlossener App, einmal (`reminded_at`). Wird der Tag
  verschoben, zieht die Erinnerung mit.
- **In anderen Apps (CalDAV):** Kontext stellt die Boards unter `/dav/` als Aufgabenlisten
  bereit (RFC 4791, nur VTODO; `server/dav/`), gefunden über `/.well-known/caldav`: eine Liste
  je Board, das man hat, „Meine Aufgaben (Kontext)“ und „Aufgaben info@“. Angemeldet wird mit
  Mail-Adresse und Passwort; Kontext fragt Stalwarts JMAP-Session damit und merkt sich die
  Antwort fünf Minuten. Clients lesen per PROPFIND (mit `getctag`) und REPORT
  `calendar-multiget`/`calendar-query`, schreiben mit PUT (`If-Match` auf den ETag) und löschen
  mit DELETE; `sync-collection` gibt es nicht, die Clients fallen auf den ctag zurück. Titel,
  Notiz, Fälligkeit (Zeiten in UTC hinaus, ohne Zone hinein als Berliner Zeit), Erledigt,
  Wiederholung (`RRULE`, nur was Kontext kennt) und Erinnerung (`VALARM`) gehen hin und her;
  „in Arbeit“ ist im Client `IN-PROCESS` und in Kontext die erste Spalte nach „Offen“. Checkliste
  und Verknüpfungen bleiben in Kontext. Was ein Client anlegt, behält seinen Dateinamen und seine
  UID (`dav_name`, `dav_uid`). Mit Bestätigung in zwei Schritten klappt die Anmeldung noch nicht.
- **Schnelleingabe** (`src/lib/tasks.ts`): ein letztes Wort „heute“, „morgen“, „übermorgen“, ein
  Wochentag oder ein Datum wie „30.10.“ wird zur Fälligkeit.
- **Abgleich im Team:** Nach jeder Änderung meldet der Server über die
  [Live-Verbindung](#live-verbindung), welches Board sich geändert hat; alle, die dieses Postfach
  öffnen können, und die Zuständigen laden die Aufgaben neu. Eigene Änderungen zeigt die App sofort und korrigiert
  sie, wenn der Server etwas anderes sagt.

## Team-Chat

Der Chat (`src/features/chat/`, Server `server/chat/`) liegt in Kontexts SQLite
(`chat_channels`, `chat_members`, `chat_messages`, `chat_reads`, `chat_reactions`); Stalwart hat
keinen Chat.
Personen sind ihre persönliche Konto-ID aus der JMAP-Session (in Stalwart zugleich die
Principal-ID), die Namen holt die App wie bei den Aufgaben über die Principals.

- **Kanäle:** `#allgemein` für alle in der Firma; ein Kanal pro gemeinsamem Postfach (info@,
  rechnung@), den sieht, wer das Postfach in seiner JMAP-Session hat – wer aus info@ austritt,
  verliert auch den Kanal; eigene Kanäle mit ausgewählten Mitgliedern (Namen klein mit
  Bindestrich, „Baustelle Hoffmann“ wird `#baustelle-hoffmann`); Direktnachrichten an eine oder
  mehrere Personen – dieselben Personen landen immer in derselben Unterhaltung (`direct_key`).
  `#allgemein` und die Postfach-Kanäle legt der Server beim ersten Blick in den Chat an.
- **Wer was sieht:** `canSee` in `server/chat/chat.ts` – jede Anfrage und jedes Live-Ereignis
  geht nur an Personen, die den Kanal sehen dürfen.
- **Gelesen und Ungelesen:** pro Person und Kanal der Zeitpunkt, bis zu dem gelesen ist; was man
  selbst schreibt, ist gelesen. Ungelesen und Erwähnungen zählt der Server, die App zeigt sie am
  Chat in Leiste und Tab-Leiste und am App-Symbol. In Direktnachrichten steht „Gelesen“ unter der
  eigenen letzten Nachricht.
- **@Erwähnungen:** Beim Tippen schlägt die App Personen vor (in Kanälen und Direktnachrichten
  nur Mitglieder) und schickt deren IDs mit; markiert werden nur Namen, die wirklich erwähnt
  wurden. Eine Erwähnung oder Direktnachricht wird zur Benachrichtigung auf dem Gerät, wenn sie
  dort eingeschaltet ist und Kontext im Hintergrund liegt.
- **Verlauf:** 50 Nachrichten je Seite, ältere auf Knopfdruck; Nachrichten einer Person kurz
  hintereinander stehen unter einem Namen, eine Linie „Neu“ zeigt, wo das Ungelesene beginnt.
- **Antworten im Thread:** „Antworten“ an einer Nachricht öffnet ihren Thread – auf breiten
  Bildschirmen neben dem Gespräch, am Handy statt seiner. Antworten tragen `parent_id`, stehen
  nicht im Kanal und zählen dort nicht als ungelesen; unter der Nachricht steht „3 Antworten ·
  zuletzt 10:42“ mit den Köpfen, „Neu“, wenn seit dem letzten Lesen welche kamen. Wer im Thread
  geschrieben hat (auch die erste Nachricht), bekommt neue Antworten aufs Gerät
  (`notifyWho`). Antworten auf Antworten gibt es nicht.
- **Reaktionen:** 👍 ❤️ 😂 🎉 👀 ✅ 🙏 über den Smiley an jeder Nachricht, jedes Emoji einmal pro
  Person (`chat_reactions`); ein Klick auf eine Reaktion setzt oder nimmt die eigene, im Tooltip
  steht, wer. Kommt bei allen sofort an, ohne Benachrichtigung.
- **Aufbewahrung:** Die Firmenverwaltung stellt unter „Team-Chat“ ein, wie lange Nachrichten
  bleiben (unbegrenzt, 30 Tage bis 5 Jahre; `company_setting` `chat_retention_days`). Der Server
  löscht Älteres beim Speichern, beim Start und stündlich (`server/chat/retention.ts`) mit
  Karten, Reaktionen, Fotos und Dateien; ein Thread geht erst, wenn auch seine letzte Antwort so
  alt ist. Am Anfang des Verlaufs steht, wie lange Nachrichten bleiben.
- **Fotos und Dateien:** bis 10 je Nachricht, 25 MB je Datei; über Büroklammer, Kamera (Handy),
  Ziehen auf die Unterhaltung oder Einfügen. Fotos verkleinert die App vorher (längere Seite
  2048 px, JPEG), damit sie auch unterwegs schnell ankommen, und schickt ein Vorschaubild mit
  (640 px, `<id>.thumb`), das der Verlauf statt des Fotos lädt; groß geöffnet kommt das Foto
  selbst. Der Server legt sie unter
  `chat-files/` neben der Datenbank ab (`chat_files`, `server/chat/files.ts`) und gibt sie nur
  an Personen, die den Kanal sehen; Fotos (JPEG, PNG, WebP, GIF) zeigt der Browser an, alles andere
  wird heruntergeladen (`Content-Security-Policy: sandbox`, nie HTML oder SVG aus derselben
  Herkunft). Hochgeladenes, das nie verschickt wurde, löscht der Server nach einem Tag.
- **Karten:** Mails, Aufgaben und Kontakte hängen als Karte an einer Nachricht (`chat_cards`).
  Die Karte hält fest, worum es geht (Betreff, Absender, Zeit; Titel; Name, Firma) – öffnen kann
  sie nur, wer die Mail, die Aufgabe oder den Kontakt ohnehin sehen darf. Alle anderen sehen
  „Liegt bei … – nur dort zu öffnen“; kopiert wird nichts. Eine Aufgaben-Karte zeigt ihren
  aktuellen Stand.
- **Mail als Kopie:** Beim Besprechen einer geöffneten Mail lässt sie sich „Als Kopie teilen“:
  Die App lädt Absender, Empfänger, Datum und Text als Datei hoch (Typ
  `application/vnd.kontext.mail+json`, nicht unter den Dateien gezeigt), die Anhänge als
  Dateien der Nachricht; die Karte zeigt auf die Kopie (`copy_id`). Wer das Postfach nicht öffnen
  kann, liest sie über die Karte – den Text erneut bereinigt, Bilder aus dem Internet blockiert.
  Die Kopie bleibt, auch wenn die Mail später gelöscht wird.
- **Über eine Mail sprechen:** „Besprechen“ in der Werkzeugleiste der Mail (Taste `b`) schickt
  sie als Karte mit einer Nachricht in einen Kanal oder an eine Person, statt sie intern
  weiterzuleiten. Vorgeschlagen werden zuerst Kanäle, in denen dieselbe Unterhaltung
  (`threadId`) schon besprochen wurde, dann solche, in denen derselbe Absender vorkam, dann der
  Kanal des Postfachs. Die Mail zeigt danach „Besprochen in #… · n Antworten“ und führt an die
  Stelle im Chat.
- **Bearbeiten und löschen:** nur eigene Nachrichten; eine bearbeitete trägt „(bearbeitet)“,
  eine gelöschte behält ihren Platz („Nachricht gelöscht“), Text, Karten, Fotos und Dateien sind
  dann wirklich weg. Beides kommt bei den anderen sofort an.
- **Suche:** über alle Kanäle, die man sieht – im Text und in den Karten (Betreff, Titel, Name),
  ab zwei Buchstaben; ein Treffer führt an die Stelle im Verlauf, eine Antwort in ihren Thread.
  Groß und klein spielt keine Rolle, auch bei Umlauten: jede Nachricht trägt ihren Text und die
  Titel ihrer Karten klein geschrieben (`folded`, für ältere Nachrichten beim Start ergänzt), da
  SQLite nur bei ASCII ohne Unterschied vergleicht.
- **Stummschalten, verlassen, löschen:** Stummgeschaltetes zählt nicht zum Ungelesenen am Chat
  und am App-Symbol und meldet sich nicht. Einen eigenen Kanal verlassen kann jedes Mitglied (der
  letzte nimmt ihn mit), löschen nur, wer ihn angelegt hat – mit allen Nachrichten und Dateien.
  `#allgemein`, Postfach-Kanäle und Direktnachrichten lassen sich nur stummschalten.
- **Neu dabei:** Wer in einen Kanal kommt, hat ihn bis dahin gelesen; in `#allgemein` und den
  Postfach-Kanälen zählen ohne Gelesen-Marke nur die letzten sieben Tage als ungelesen.
- **Aufgabe aus einer Nachricht:** im Menü jeder Nachricht; die Aufgabe ist mit der Nachricht
  verknüpft (`kind: "chat"`), die Nachricht zeigt die Aufgabe mit ihrem Stand, die Aufgabe führt
  zurück zur Nachricht. Aus dem Kanal eines gemeinsamen Postfachs landet sie auf dessen Board.

## Anrufe

Aus jeder Unterhaltung im Chat heraus: „Anrufen“ und „Videoanruf“ in Direktnachrichten,
„Besprechung starten“ in Kanälen (`src/features/calls/`, Server `server/calls/`). Ton und Bild
laufen über [LiveKit](https://github.com/livekit/livekit), das neben Stalwart auf demselben
Server läuft; Kontext baut nur die Oberfläche und entscheidet, wer hinein darf.

- **Ein Raum pro Kanal:** jede Unterhaltung hat ihren LiveKit-Raum (`kontext-<Kanal-ID>`). Wer
  den Kanal sehen darf (`canSee`), bekommt vom Server eine Eintrittskarte
  (`POST /api/calls/:kanal/join`): ein JWT, mit LiveKits API-Schlüssel signiert, zehn Minuten
  gültig, mit der persönlichen Konto-ID als Identität. Ein eigenes Rechtesystem gibt es nicht.
- **Was läuft, sagt LiveKit:** Der Server merkt sich die Gespräche nur im Speicher und erfährt
  über LiveKits Webhooks (`/api/calls/webhook`, mit dem Schlüssel signiert und mit SHA-256 des
  Inhalts), wer beitritt und geht. Daraus wird das Live-Ereignis `call` für alle, die den Kanal
  sehen; nach einem Neustart fragt der Server LiveKit, wer gerade in welchem Raum ist.
- **Klingeln:** Ein neues Gespräch in einer Direktnachricht klingelt bei den anderen – in der
  offenen App als Karte oben rechts (mit Ton), sonst als Benachrichtigung (Web Push, wie bei
  Nachrichten). „Ablehnen“ meldet der Server dem Anrufer (`call-declined`); haben alle
  abgelehnt oder geht nach 45 Sekunden niemand ran, legt die App des Anrufers auf. In Kanälen
  klingelt nichts: dort zeigt die Kopfzeile „Beitreten“, solange jemand im Gespräch ist.
- **Im Verlauf:** Endet ein Gespräch, schreibt der Server eine Zeile in die Unterhaltung
  (`chat_messages.call`, als Anrufer): „Anruf · 5 Min“, „Videoanruf · unter 1 Min“,
  „Besprechung · 3 dabei · 40 Min“. Ein Anruf, den niemand angenommen hat, steht beim Angerufenen
  als „Verpasster Anruf“ mit „Zurückrufen“ (und ersetzt die Benachrichtigung vom Klingeln), beim
  Anrufer als „Keine Antwort“ mit „Nochmal anrufen“. Die Dauer zählt bei Anrufen ab dem Annehmen,
  bei Besprechungen ab dem Start.
- **Das Gespräch:** ein Fenster unten rechts (vergrößerbar), am Handy der ganze Bildschirm; es
  bleibt offen, während man zwischen Mail, Chat und Kalender wechselt. Mikrofon, Kamera,
  Bildschirm teilen (am Rechner) und Auflegen; wer spricht, hat einen grünen Rand. LiveKits Code
  (`livekit-client`, `@livekit/components-react`) lädt erst beim ersten Gespräch.
- **Verbindung:** Die Signalisierung geht über Caddy (`/rtc`, WebSocket auf Kontexts Adresse),
  Ton und Bild direkt zum Server: UDP 7882 für alle Gespräche, TCP 7881, wenn UDP gesperrt ist.
  Verschlüsselt ist beides (WebRTC, DTLS-SRTP); LiveKit selbst kann mitschneiden, Kontext tut es
  nicht.
- **Videobesprechung am Termin:** „Videobesprechung hinzufügen“ im Termin legt einen Link
  `https://kontext.firma.de/meet/<id>` an (`/api/meet`, 128 Zufallsbits, nichts gespeichert –
  der Link ist der Schlüssel). Er steht als `virtualLocations` im Termin (in iCalendar
  `CONFERENCE`) und zusätzlich als Zeile in den Notizen, weil nicht jedes Mailprogramm der Gäste
  Online-Orte zeigt. Am Termin führt „Beitreten“ hin.
- **Gäste:** Die Seite `/meet/<id>` geht ohne Anmeldung. Kollegen treten als sie selbst bei,
  jederzeit; Gäste geben ihren Namen an und kommen erst hinein, wenn jemand aus der Firma da ist
  (bis dahin fragt die Seite alle paar Sekunden). So öffnet ein weitergeleiteter Link nie einen
  leeren Raum für Fremde. Gäste stehen in den Kacheln als „Name · Gast“.
- **Ohne LiveKit** (keine `LIVEKIT_*`-Einstellungen) sind Anrufe aus: Die App fragt
  `/api/calls` und zeigt keine Knöpfe; der Termin bietet keine Videobesprechung an.

## Telefonie

Kontext telefoniert über eine **Telefonbox** im Büro des Kunden: ein Container mit Asterisk und
dem Box-Agent (`box/`), auf einem Thin Client, einem Pi, dem Firmenserver oder einem NAS. Die
Box meldet sich im Büronetz als IP-Telefon an der Fritzbox an; die Fritzbox bleibt am Anschluss,
die Nummern und Tischtelefone bleiben, wie sie sind. Kontext selbst (Server `server/phone/`,
App `src/features/phone/`) läuft weiter auf dem VPS.

```mermaid
flowchart LR
  Fritzbox -->|"SIP im LAN (Box als IP-Telefon)"| Box["Telefonbox<br>(Asterisk + Agent)"]
  Box -->|"WebSocket, von innen nach außen"| Server["Kontext-Server"]
  Box -->|"SIP/TCP 5060, RTP"| SIP["LiveKit SIP"]
  SIP --> LiveKit
  Browser -->|WebRTC| LiveKit
```

- **Keine offenen Ports beim Kunden:** Die Box baut eine WebSocket-Verbindung zu Kontext auf
  (`/api/phone/box`) und hält sie offen. Kontext schickt ihr den ganzen Sollzustand
  (Fritzbox-Anmeldung, Zugang zu LiveKit SIP) mit Version, die Box schreibt daraus Asterisks
  Konfiguration (`box/agent/asterisk-config.ts`) und meldet Anrufe zurück: klingelt,
  angenommen, beendet (mit Q.850-Ursache). Ereignisse tragen eine laufende Nummer; nach einem
  Abbruch schickt die Box nach, was Kontext nicht bestätigt hat. Ohne Kontext telefoniert sie mit
  der letzten Konfiguration weiter (`/data/config.json`).
- **Koppeln:** In der Firmenverwaltung unter Telefonie gibt es einen Code (30 Minuten gültig).
  Die Box tauscht ihn einmal gegen ein Token (`POST /api/phone/box/pair`); beides liegt nur als
  SHA-256 in der Datenbank. Den Code gibt man der Box beim ersten Start mit oder auf ihrer
  Statusseite (`http://<box>:8089`), die sonst nur anzeigt, ob sie verbunden und an der Fritzbox
  angemeldet ist.
- **Ein Anruf kommt rein:** Die Fritzbox klingelt bei der Box (und bei den Tischtelefonen). Die
  Box meldet „klingelt“; Kontext legt den Anruf an, schaut aber nicht ins Adressbuch – das macht
  die App mit den Rechten der angemeldeten Person (`contactOfNumber`, Nummern in E.164,
  `server/phone/numbers.ts`). Bei den Personen, die unter Telefonie ausgewählt sind, erscheint
  eine Karte: Kontakt, Firma, letzte Mail, nächster Termin, „Annehmen“ – auch als Web Push.
- **Annehmen in Kontext:** Kontext gibt dem Anruf einen Raum und sagt der Box „answer“. Erst dann
  wählt Asterisk LiveKit SIP an (`<uuid>@…`, die Dispatch-Regel macht daraus den Raum
  `kontext-phone-<uuid>`) und verbindet den Anrufer – vorher klingeln die Tischtelefone weiter,
  wer zuerst abnimmt, hat ihn. Nimmt jemand am Tischtelefon ab, steht der Anruf als „Am Telefon
  angenommen“ in der Liste (Ursache 26), sonst als „Verpasst“.
- **Anrufen:** „Anrufen“ am Kontakt oder auf der Seite Telefon: Kontext legt Anruf und Raum an,
  die Person tritt dem Raum bei, die Box wählt erst LiveKit SIP an (diesen Raum) und dann über die
  Fritzbox die Nummer (national mit 0, Ausland mit 00). Ein Tastenfeld schickt Töne (DTMF) für
  Sprachmenüs.
- **Verpasste Anrufe als Aufgabe:** Ist in der Firmenverwaltung ein Board gewählt (das eigene
  einer Person oder das eines gemeinsamen Postfachs), legt ein verpasster Anruf dort „Zurückrufen:
  <Nummer>“ an, fällig heute und mit dem Anruf verknüpft (`callbackTask`). Spricht danach jemand
  mit der Nummer – Rückruf aus Kontext oder ihr nächster Anruf wird angenommen –, hakt der Server
  die Aufgabe ab (`answeredCallbacks`). Unterdrückte Nummern bekommen keine Aufgabe.
- **Ansagen:** In der Firmenverwaltung gesprochen (MediaRecorder) oder hochgeladen; der Browser
  macht daraus WAV mit 8 kHz, mono, 16 Bit (`src/lib/wav.ts`), der Server prüft nur
  (`server/phone/sounds.ts`) und legt sie unter ihrer Prüfsumme neben die Datenbank
  (`phone/sounds/`). Die Konfiguration nennt der Box die Ansagen, die sie braucht; sie lädt jede
  einmal (`/api/phone/box/files/sounds/<id>`, mit ihrem Token), bevor sie den Rest anwendet.
- **Mailbox:** Ist sie an, klingelt ein Anruf so lange wie eingestellt, dann nimmt die Box ab
  (`kontext-mailbox`): Ereignis „mailbox“ (die Karte in Kontext verschwindet), Ansage, Piepton,
  `Record()` bis zu zwei Minuten. Legt der Anrufer auf, lädt der Agent die Aufnahme hoch
  (`PUT /api/phone/box/files/voicemail/<anruf>`), erst danach meldet er das Ende. Kontext legt sie
  beim Anruf ab (`phone/voicemail/`, abspielbar in der Liste) und legt eine Mail mit der Aufnahme
  in das gewählte Postfach: mit `Email/import` über die Anmeldung von jemandem, der dort schreiben
  darf (`server/jmap-server.ts`), so wie die Aufgaben aus Regeln.
- **Öffnungszeiten:** prüft die Box selbst, damit sie auch ohne Kontext gelten: am Anfang jedes
  Anrufs geschlossene Tage, dann die offenen Zeiträume, beides mit `GotoIfTime` in Europe/Berlin
  (`box/agent/dialplan.ts`). Außerhalb meldet sie „closed“ statt „klingelt“ – Kontext legt den
  Anruf ohne Klingeln und ohne Web Push als „Außerhalb der Öffnungszeiten“ an –, spielt die Ansage
  und nimmt, wenn die Mailbox an ist, eine Nachricht auf. Asterisk kennt bei Tagen keine Jahre;
  Kontext schickt deshalb nur kommende Tage und die Konfiguration einmal täglich neu. Die
  Feiertage für Baden-Württemberg rechnet `server/phone/holidays.ts` aus (Ostern nach Gauß).
- **Durchwahlen:** Jede weitere Nummer ist ein weiteres IP-Telefon an derselben Fritzbox, das dort
  nur auf diese Nummer reagiert; die Box meldet sich mit jedem an (`fritzbox-<id>`). Anrufe
  kommen über den ersten Endpunkt herein (Zuordnung nach Adresse) und verraten ihre Leitung über
  die gewählte Nummer, den Benutzernamen (`contact_user`, im Dialplan `${EXTEN}` → `Line`).
  Kontext lässt dann nur die Leute dieser Durchwahl klingeln (alle zugleich). Wer auf einer
  Durchwahl ist, ruft mit ihr an: Der Agent setzt beim Originate `KONTEXT_OUT=fritzbox-<id>`.
- **Tischtelefone (Snom):** melden sich an der Box an, nicht an der Fritzbox (PJSIP-Endpunkt
  `desk-<id>`, die Box ist ihr Registrar). Ihre Einstellungen holen sie sich von der Box
  (`http://<box>:8089/snom/<mac>.xml`, `box/agent/snom.ts`): Konto, Sprache, Töne, Zeitzone. Sie
  klingeln zusammen mit Kontext (`Dial` statt `Wait`, je Leitung ihre Telefone: das einer Person
  bei deren Nummern, ein gemeinsames bei der ersten); wer abnimmt, meldet sich über
  `kontext-answered-here` mit seinem Endpunkt. Untereinander erreichen sie sich per Kurzwahl;
  Anrufe nach draußen gehen über die Fritzbox (mit der Durchwahl ihrer Person) und stehen in der
  Liste. Kontext erreicht sie über die Kurzwahl, auch beim Weitervermitteln.
- **Sprachmenü:** Nach den Öffnungszeiten nimmt die Box ab (`kontext-menu`), spielt die Ansage
  mit `Background()` und wartet auf eine Taste. Eine Taste setzt `KONTEXT_CHOICE` und klingelt
  (Kontext lässt die Leute dieser Taste klingeln, alle zugleich, und zeigt das Thema am Anruf) oder
  führt auf die Mailbox; ohne Taste klingelt es wie sonst. Weil der Anruf dann schon angenommen
  ist, spielt die Box den Klingelton selbst (`Playtones(ring)`).
- **Sperrliste:** prüft die Box ganz am Anfang, vor Öffnungszeiten und Klingeln: die gesperrten
  Nummern in jeder Form, in der die Fritzbox sie liefern kann (national, `+49`, `0049`, `49`,
  `numberForms`), und auf Wunsch unterdrückte. Sie meldet „blocked“ und weist ab (Ursache 21);
  Kontext legt den Anruf als „Gesperrt“ in die Liste, ohne Klingeln.
- **Auswertung:** `GET /api/phone/stats` rechnet aus den Anrufen, die man sehen darf
  (`server/phone/stats.ts`): Anrufe, angenommen und wie schnell, verpasst (nach Wochentag und
  Stunde in Europe/Berlin), außerhalb der Zeiten, Nachrichten, wer angenommen hat.
- **Türsprechstelle:** Die Türsprechanlage der Fritzbox ruft ihre Telefone über eine interne
  Nummer (meist `**11`). Kommt ein Anruf von ihr, klingelt es bei den dafür gewählten Leuten mit
  „Tür öffnen“: Kontext schickt der Box `door-open`, sie lenkt die Leitung nach
  `kontext-door-open` um, nimmt ab, sendet den Code als DTMF (`SendDTMF`) und legt auf. Mit
  „Sprechen“ nimmt man wie sonst an.
- **Präsenz:** Wer in einem Telefon-Raum ist oder am Tischtelefon spricht, „telefoniert“ – das
  geht als `phone-people` an alle (der Chat zeigt es an der Person). Bitte nicht stören und
  Abwesend (bis zu einer Zeit) liegen in `phone_status`; wer nicht erreichbar ist, fällt aus dem
  Klingelplan (`withoutUnavailable`, auch bei „der Reihe nach“), bekommt keinen Web Push, und sein
  Tischtelefon klingelt nicht (die Box bekommt eine neue Konfiguration, auch wenn „Abwesend bis“
  abläuft).
- **Wer klingelt wann:** Alle gleichzeitig oder der Reihe nach (jede Person eine Weile, dann
  alle, `ringingFor`). Die Reihenfolge rechnet die App selbst aus Beginn und Plan (die Karte
  erscheint, wenn man dran ist); Web Push geht jeweils an die, die gerade dran sind. Ein Handy
  ruft die Box nach der eingestellten Zeit über die Fritzbox mit an (`Dial` in `kontext-in`,
  zweite Leitung); nimmt es ab, meldet die Box „angenommen“ mit `forwarded` und der Anruf steht
  als „Am Handy angenommen“ in der Liste. Solange es klingelt, kann man ihn in Kontext noch
  annehmen (Redirect beendet das `Dial`).
- **Weitervermitteln:** Ein Gespräch lebt in seinem LiveKit-Raum, Weitervermitteln heißt also, wer
  im Raum ist (`server/phone/transfer.ts`). An eine Kollegin: Der Anruf klingelt bei ihr
  (`offeredTo`), nimmt sie an, gehört er ihr und sie tritt dem Raum bei; sobald LiveKits Webhook
  sie im Raum meldet, verlässt der Übergebende ihn. An eine Nummer oder ein Telefon der Fritzbox
  (`**610`): Die Box wählt sie in denselben Raum (zweite Leitung über die Fritzbox, die braucht
  dafür zwei freie Leitungen); ist abgenommen, geht man, und beide sprechen über den Raum weiter.
  Kontext merkt sich, wer von Kontext in welchem Raum ist; bleibt nur eine Seite übrig (Personen
  im Raum plus verbundene Leitungen, `roomIsOver`), legt es die übrigen Leitungen auf – auch wenn
  der Anrufer auflegt und nur noch das Handy der Kollegin dran wäre.
- **Halten, Rückfrage, Dreierkonferenz:** „Halten“ schickt der Box `hold`: Sie lenkt die Leitung
  nach draußen nach `kontext-hold` um (Wartemusik), damit verlässt sie den Raum; „Fortsetzen“
  (`resume`) wählt den Raum wieder an (`kontext-resume`). Eine gehaltene Leitung zählt weiter als
  Seite, der Raum endet also nicht. „Dazuholen“ ist ein Angebot wie beim Übergeben, nur bleibt der
  Anruf beim Fragenden (`offeredJoin`); wer im Raum ist, darf halten und auflegen. Sind noch
  Kolleginnen im Gespräch, heißt der rote Knopf „Gespräch verlassen“ und legt nichts auf.
- **Ende eines Anrufs:** meldet die Leitung nach draußen selbst, wo immer sie gerade ist
  (klingelt, im Raum, gehalten, auf der Mailbox): ein Hangup-Handler (`kontext-ended`) statt der
  `h`-Extension je Kontext. Ein Anruf nach draußen, der nicht angenommen wird, meldet sein Ende
  über die Leitung in den Raum (`kontext-out-ended`, Grund aus `DIALSTATUS`). CI lässt Asterisk
  die Konfiguration mit allen Funktionen lesen (`box/sample-config.ts`).
- **Auflegen:** in Kontext (Box legt auf, mit allen dazugewählten Leitungen), beim Anrufer (Box
  meldet das Ende) oder wenn die Person den Raum verlässt, etwa weil der Tab zu ist (LiveKits
  Webhook) und niemand mehr da ist.
- **LiveKit SIP** braucht Redis (zur Absprache mit LiveKit). Kontext richtet beim Start einen
  Eingangs-Trunk mit Passwort (nur die Boxen) und die Dispatch-Regel ein
  (`server/phone/livekit-sip.ts`); ob das klappt, zeigt die Firmenverwaltung.
- **Notruf:** 110 und 112 bleiben über die Fritzbox und die Tischtelefone; Kontext wählt sie
  nicht.

## Live-Verbindung

Jede offene App hält eine Verbindung `/api/live` (Server-Sent Events, `server/live/`). Der Server
merkt sich nur, wer verbunden ist (`hub.ts`), und schickt jedes Ereignis an die, die es sehen
dürfen: neue Nachrichten, „schreibt …“, Gelesen-Marken, geänderte Kanäle, wer online ist,
geänderte Aufgaben-Boards, Anrufe und Telefonate. Mails meldet Stalwart weiter selbst (JMAP Push).

- Alle 25 Sekunden ein Kommentar, damit Proxys die ruhige Verbindung nicht schließen; Caddy
  komprimiert die beiden Streams nicht (`deploy/Caddyfile`), sonst kämen Ereignisse verzögert an.
- Wer was sehen darf, fragt der Server Stalwart (JMAP-Session) und merkt es sich je Sitzung eine
  halbe Minute; eine geänderte Berechtigung gilt spätestens danach.
- Nach 15 Minuten beendet der Server die Verbindung, der Browser baut sie sofort neu auf – mit den
  aktuellen Rechten aus der JMAP-Session. Nach einer Unterbrechung lädt die App Chat und Aufgaben
  neu, damit nichts fehlt.

## Drucken

„Drucken“ im Menü „…“ der Mail, `p` oder Strg+P (Cmd+P) druckt die offene Mail, nicht die App
darum: `src/lib/print.ts` baut eine eigene Seite (Betreff, Von, An, Cc, Datum, bei gemeinsamen
Postfächern das Postfach, der Text, die Namen der Anhänge; hell, A4), `print-mail.ts` lädt sie in
ein unsichtbares Frame ohne Skripte und öffnet den Druckdialog des Browsers. Der Text ist derselbe
bereinigte wie im Lesebereich, eingebettete Bilder kommen mit, Bilder aus dem Internet nicht.

## Mehrere Mails auswählen

Wie in Gmail: am Desktop erscheint beim Überfahren einer Zeile links ein Kästchen, Shift-Klick
nimmt den Bereich bis zur zuletzt gewählten Mail dazu, `x` die offene Mail; am Handy schaltet
„Auswählen“ die Kästchen ein. Solange etwas gewählt ist, ersetzt eine Leiste den Titel der Liste:
archivieren, löschen, Spam, gelesen/ungelesen, markieren, Kategorie, verschieben.

Gewählt wird nach Konto und Mail (`src/lib/selection.ts`), denn „Alle Posteingänge“ und die Suche
mischen Postfächer. Ausgeführt wird je Konto und Ordner, aus dem die Mails kommen; Kategorie und
Verschieben gibt es nur, wenn alle gewählten Mails in einem Postfach liegen, weil Kategorien und
Ordner zum Postfach gehören. Was nicht mehr in der Liste steht, fällt aus der Auswahl; ein anderer
Ordner oder eine neue Suche beginnt ohne Auswahl.

## Suche

Die Suche (`/mail/all/search?q=…`) läuft über alle Ordner und Postfächer, Papierkorb und Spam
nur mit `in:papierkorb` / `in:spam`. `src/lib/mail-search.ts` zerlegt den Text in Wörter und
Operatoren (deutsch und englisch: `von:`/`from:`, `an:`, `betreff:`, `hat:anhang`,
`ist:ungelesen`, `ist:markiert`, `in:`, `nach:`, `vor:`, `kategorie:`/`label:`) und baut daraus pro Konto einen
`Email/query`-Filter; die Listen der Konten werden wie bei „Alle Posteingänge“ gemischt.

Stalwart sucht mit Wortstämmen, findet ein Wort, das schon sein eigener Stamm ist („Angebot“),
aber nur genau so. Deshalb fragt die App für jedes Wort auch seine Grundform ab („Angebote“ →
„Angebot“, „Rechnungen“ → „Rechnung“). Zusammengesetzte Wörter („Wartungsvertrag“ für „Wartung“)
und Text in PDF-Anhängen findet Stalwart nicht; Text- und HTML-Anhänge schon.

Vorschläge beim Tippen kommen aus den Kontakten (für `von:`/`an:`), den Ordnern (für `in:`), den
Operatoren und den letzten Suchen (pro Gerät im Browser).

## Unterhaltungen

Die Liste bleibt, wie die Mails hereinkommen; die Unterhaltung steht dort, wo sie hilft – beim
Lesen (`src/features/mail/conversation.tsx`, `src/lib/conversation.ts`). Grundlage sind die
Threads von JMAP (RFC 8621 §3): Stalwart hält jede Mail in einer Unterhaltung, über alle Ordner
eines Kontos – auch die Antworten im Gesendet-Ordner.

- **Beim Lesen:** über der Mail eingeklappt „3 frühere Nachrichten in dieser Unterhaltung“, darunter
  die Antworten, die seitdem kamen. Papierkorb, Spam und Entwürfe zählen nicht mit. Eine Zeile führt
  zu der Mail; Antworten aus dem Postfach selbst tragen „Gesendet“, in gemeinsamen Postfächern mit
  dem Namen der Kollegin statt „(Allgemeine Anfragen)“.
- **Zitate eingeklappt:** Das zitierte Original unter einer Antwort ist eingeklappt („Zitierten
  Text anzeigen“) – erkannt an Kontexts eigenem Zitat („Am … schrieb …:“ und `blockquote`), an
  Gmails `.gmail_quote`, Outlooks `#divRplyFwdMsg`, Thunderbirds `.moz-cite-prefix`, in Textmails
  an „> “-Zeilen. Besteht eine Mail nur aus dem Zitat (Weiterleitung), bleibt sie ganz.
- **Wer hat geantwortet:** Mails mit `$answered` zeigen in der Liste einen kleinen Pfeil, in
  gemeinsamen Postfächern mit Name und Zeit der Antwort aus dem Gesendet-Ordner („Jonas · 14:02“) –
  damit nicht zwei Leute derselben Kundin antworten. Die Threads dazu holt die Liste in einer
  Anfrage je Postfach.
- **Gruppiert, auf Wunsch:** „Mails als Unterhaltungen gruppieren“ (Einstellungen → Darstellung, je
  Gerät) zeigt eine Zeile je Unterhaltung (`collapseThreads`, RFC 8621 §4.4.3) mit den Beteiligten
  und der Zahl der Mails; Archivieren, Löschen, Verschieben und Spam gelten dann für alle Mails der
  Unterhaltung im Ordner, Markieren für die eine. Die Suche zeigt weiter einzelne Mails.

## Senden rückgängig und später senden

Beides macht Stalwart selbst: Es hält eine Mail in seiner Warteschlange (FUTURERELEASE, RFC 4865 –
`HOLDFOR` in Sekunden, `HOLDUNTIL` mit Zeitpunkt, bis 7 Tage im Voraus) und gibt sie frei, solange sie
dort liegt (`undoStatus: "canceled"`, RFC 8621 §7). Die Empfänger nimmt es dann aus den Kopfzeilen
(`src/jmap/mail.ts` `sendEmail`, `src/jmap/submissions.ts`).

- **Rückgängig:** Jede Mail wartet nach „Senden“ ein paar Sekunden (Einstellungen → Darstellung,
  je Gerät: aus, 5, 10, 20 oder 30 Sekunden; vorgegeben 10). So lange steht „Rückgängig“ an der
  Meldung; danach ist sie unterwegs („Zu spät – die Mail ist schon unterwegs“).
- **Später senden:** der Pfeil neben „Senden“ – heute 13 oder 17 Uhr (solange das noch kommt),
  morgen 8 Uhr, Montag 8 Uhr, oder ein Zeitpunkt nach Wahl. Die Mail liegt bis dahin im
  Gesendet-Ordner unter „Geplant“, mit Zeitpunkt in der Liste und „Nicht senden“ in der Mail.
- **Zurückholen:** erst wird der Versand gestoppt, dann kommt die Mail zurück zu den Entwürfen und
  öffnet sich zum Ändern – nie liegt eine Mail bei den Entwürfen, die doch hinausging.

## Textbausteine

Standardantworten liegen in Kontexts SQLite (`snippets`, `server/snippets/`), je Konto: die
eigenen nur für einen selbst, die eines gemeinsamen Postfachs für alle, die darin arbeiten –
anlegen und ändern darf, wer das Postfach nicht nur lesen darf. Verwaltet werden sie unter
Einstellungen → Textbausteine; im Schreibfenster bietet „Textbaustein einfügen“ (am Ende der
Formatierungsleiste) die eigenen und die des Absender-Postfachs an. Der Text kommt an die
Cursorstelle, `{Vorname}` und `{Name}` werden durch den Namen des ersten Empfängers ersetzt.

## Wiedervorlage

Eine Mail „aus dem Weg bis …“: Knopf mit dem Wecker über der Mail oder `w` – heute 13 oder
17 Uhr, morgen oder Montag 8 Uhr, in einer Woche, oder ein Zeitpunkt nach Wahl (bis ein Jahr).

- **Ordner:** die Mail wandert in den Ordner mit der JMAP-Rolle `snoozed` („Wiedervorlage“, in
  IMAP `\Snoozed`, also auch in Thunderbird sichtbar); Kontext legt ihn beim ersten Mal an. Dort
  steht an jeder Mail „Kommt … wieder“, die nächste zuerst, und in der Mail „Jetzt zurückholen“.
- **Zeitpunkt:** JMAP kennt keine Wiedervorlage; die Zeiten liegen in Kontexts SQLite (`snoozes`,
  `server/snooze/`), je Konto – in info@ sieht das Team, wann eine Mail zurückkommt. Erst wird
  der Zeitpunkt gespeichert, dann die Mail verschoben; ein Zeitpunkt ohne Mail im Ordner verfällt.
- **Zurück:** jede Minute holt der Server Fälliges zurück (`waker.ts`), mit dem Token der
  neuesten Sitzung dessen, der die Mail zurückgelegt hat – ist er abgemeldet, mit dem einer
  Kollegin, die in das Postfach schreiben darf. Die Mail kommt ungelesen in den Posteingang, mit
  dem Schlagwort `kontext.resurfaced`, und der Zurücklegende bekommt eine Benachrichtigung.
  Hat jemand die Mail inzwischen anderswohin verschoben, bleibt sie, wo sie ist.
- **Wieder vorgelegt:** der Posteingang zeigt solche Mails, solange sie ungelesen sind, oben in
  einer eigenen Gruppe – nach Datum lägen sie weit unten. Gelesen nimmt Kontext das Schlagwort
  wieder ab, und die Mail steht an ihrem Platz.

## Alle Posteingänge

`/mail/all/inbox` zeigt die Posteingänge des eigenen Kontos und der gemeinsamen Postfächer in
einer Liste. Jedes Konto lädt seine Seiten wie in der Ordneransicht (derselbe Cache, damit
Gelesen, Verschieben und Löschen überall gleich ankommen); die App mischt sie nach Datum. Solange
ein Konto noch ältere Mails nachladen kann, zeigt die Liste nichts, was älter ist als dessen
älteste geladene Mail, damit die Reihenfolge stimmt. Eine geöffnete Mail trägt ihr Konto in der
URL (`account`); Antworten gehen deshalb aus dem richtigen Postfach.

## Leseansicht auf breiten Bildschirmen

Die Mail steht linksbündig unter der Werkzeugleiste, die Textspalte bleibt höchstens 780 px breit
(etwa 70 Zeichen pro Zeile, gut zu lesen). Ab 1536 px (`2xl`) füllt eine Spalte rechts den Platz
(`src/features/mail/sender-panel.tsx`): die Person, mit der die Mail ist – der Absender, bei
eigenen Mails (auch aus info@) der erste andere Empfänger (`src/lib/correspondent.ts`) –, ihre
Kontaktkarte, falls es eine gibt, sonst „Als Kontakt speichern“ ins eigene Adressbuch; dazu Mail,
Termin und Anrufen, die nächsten Termine (`useEventsWith`) und die letzten Mails mit ihr aus dem
Postfach der geöffneten Mail.

## Anhänge

Jeder Anhang ist eine Karte (`src/features/mail/attachments.tsx`): oben eine Vorschau, unten Typ,
Name, Größe und Herunterladen. Fotos (PNG, JPEG, GIF, WebP, AVIF, BMP, SVG; bis 15 MB) zeigt der
Browser selbst; von PDFs (bis 25 MB) zeichnet pdf.js die erste Seite als Bild. pdf.js wird erst
geladen, wenn ein PDF zu sehen ist, und rechnet in seinem Worker (gleiche Herkunft, die CSP
erlaubt `'self'`); als reine Build-Abhängigkeit kommt es nicht ins Server-Image. Alles andere
bekommt eine farbige Kachel nach Dateityp (`src/lib/attachment-kind.ts`).

Ein Klick auf die Vorschau öffnet PDFs und Fotos in einem neuen Tab – aus dem Blob, den die
Vorschau schon geladen hat, damit der Browser den Tab nicht blockiert. SVG, HTML und alles andere
wird nur heruntergeladen: als `blob:`-Seite liefe es mit den Rechten der App. Die Testdaten haben
echte PDFs (`dev/pdf.ts`) und einen Grundriss als SVG.

## Darstellung und Tastaturkürzel

Hell oder dunkel ist eine Klasse an `<html>`: `public/theme.js` setzt sie vor dem ersten Bild aus
der Wahl in den Einstellungen (pro Gerät im Browser gespeichert) oder aus der Einstellung des
Geräts; als eigene Datei, damit die Content-Security-Policy keine Inline-Skripte erlauben muss.

Tastaturkürzel sind einzelne Tasten wie in Gmail und stehen als Liste in `src/lib/shortcuts.ts`;
die Hilfe (`?` oder das Tastatur-Symbol unten in der Leiste) und die Einstellungen zeigen dieselbe
Liste. Solange ein Eingabefeld oder ein Dialog den Fokus hat, greift keine Taste.

## Benachrichtigungen

Die Glocke in der Leiste (`src/features/notifications/`) zeigt, was aus dem Stand des Servers
folgt: ungelesene Mails der letzten drei Tage in allen Posteingängen (eigene und gemeinsame),
Einladungen im eigenen Kalender, die noch auf Antwort warten (dieselbe Prüfung wie im Kalender,
`isInvitation`), und die restlichen Termine des Tages. Push hält das aktuell wie jede andere
Ansicht; wer eine Mail am Handy liest, sieht sie hier verschwinden. Auf dem Server wird nichts
gespeichert: Den Punkt an der Glocke gibt es für Mails, die nach dem letzten Öffnen kamen, und für
Einladungen, die damals noch nicht da waren – beides merkt sich der Browser.

„Auf diesem Gerät benachrichtigen“ (in der Glocke und unter Einstellungen → Darstellung) fragt den
Browser um Erlaubnis und meldet das Gerät für **Web Push** an. Ob die Erlaubnis noch besteht, fragt
die App über die Permissions-API ab; nimmt man sie im Browser zurück, schaltet sich der Schalter aus.

- **Bei geschlossener App:** neue Mails in allen Posteingängen, Chat-Nachrichten an einen selbst
  (Direktnachrichten, @Erwähnungen, nicht aus stummgeschalteten Kanälen) und eingehende
  [Anrufe](#anrufe) kommen als Push, auch wenn Kontext ganz zu ist. Den Push sendet der Kontext-Server (`server/push/`): mit seinem
  VAPID-Schlüssel (RFC 8292, beim ersten Start erzeugt und versiegelt in der Datenbank) und
  Ende-zu-Ende verschlüsselt für das eine Gerät (RFC 8291) – der Push-Dienst von Google, Apple,
  Mozilla oder Microsoft sieht den Inhalt nicht. Für Mails hört der Server dafür Stalwarts
  JMAP-Event-Stream ab, je Person mit dem Token ihrer jüngsten Sitzung. (Stalwart könnte selbst
  Push senden, aber ein Browser hat nur einen Absender-Schlüssel, und der ist schon der des Chats.)
- **Welche Postfächer:** Unter dem Schalter lassen sich Postfächer abwählen (etwa info@ für wen,
  der dort nur aushilft); das gilt für alle Geräte der Person (`push_mailboxes_off`).
- **Wohin:** nur an die Push-Dienste der Browser (keine beliebige Adresse – der Server soll sich
  nicht nach innen schicken lassen). Die Anmeldung eines Geräts gehört zu seiner Sitzung: Wer sich
  abmeldet, bekommt dort keine Pushes mehr; beim nächsten Öffnen meldet sich das Gerät neu an.
- **Vorne:** Ist Kontext offen und vorn, zeigt der Service Worker nichts; die App zeigt es selbst.
  Mail und Chat tragen dasselbe `tag` wie die Meldungen der offenen App, so erscheint nichts doppelt.
- **iPhone und iPad:** Web Push gibt es dort nur für die installierte App („Zum Home-Bildschirm“).
- **Erinnerungen an Termine** (15 Minuten vorher, `src/lib/notifications.ts`) kommen weiterhin nur,
  solange Kontext offen ist.

## Speicherplatz

Der Ring um das eigene Bild (Leiste, am Handy die Tableiste) zeigt den Speicher des eigenen
Postfachs aus `Quota/get` (RFC 9425, `octets`): gelb ab 80 %, rot ab 95 % (`src/lib/storage.ts`);
Tooltip und Benutzermenü nennen die Zahlen. Gemeinsame Postfächer haben ihr eigenes Kontingent; es
steht als Balken unten in ihrer Ordnerliste. Die Testdaten geben jedem Benutzer 5 GB.

## Kontaktgruppen

Eine Gruppe ist eine JSContact-Karte mit `kind: "group"`; ihr `members` hält die `uid`s der
Mitglieder (RFC 9553). Stalwart speichert sie wie jeden Kontakt. Mitglieder kommen immer aus
demselben Konto, weil eine `uid` nur dort eindeutig ist.

## vCard-Import und -Export

Beim Import liest Stalwart die Datei (`ContactCard/parse`, Abbildung nach RFC 9555). Weil
`parse` nur eine Karte pro Blob liest, teilt die App die Datei in einzelne Karten und legt sie mit
`Blob/upload` (RFC 9404) im selben Request als Blobs an, 50 pro Request. Karten, die es im
Adressbuch schon gibt (gleiche `uid`, oder gleicher Name und gleiche Mail-Adresse), werden
übersprungen; vor dem Anlegen zeigt die App, wie viele neu sind. Der Export schreibt vCard 4.0
(RFC 6350) aus den Feldern, die die App bearbeitet, auch Gruppen mit `MEMBER`.

## Adressbücher und Kalender teilen

Adressbücher und Kalender werden über ihr `shareWith` geteilt (draft-ietf-jmap-contacts und
-calendars): pro Kollege (Principal-ID, in Stalwart zugleich die Konto-ID) die Rechte. Kontext
bietet zwei Stufen:

| Stufe          | Adressbuch                         | Kalender                                                                              |
| -------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| **Lesen**      | `mayRead`                          | `mayReadFreeBusy`, `mayReadItems`                                                     |
| **Bearbeiten** | `mayRead`, `mayWrite`, `mayDelete` | dazu `mayWriteAll`, `mayWriteOwn`, `mayUpdatePrivate`, `mayRSVP`                      |

Stalwart erlaubt bei Adressbüchern mit `mayWrite` nur Anlegen und Ändern; Löschen von Kontakten
braucht `mayDelete`. Bei Kalendern enthält `mayWriteAll` das Löschen schon. Weiterteilen
(`mayShare`) und Löschen des ganzen Kalenders bleiben beim Besitzer.

Wer etwas geteilt bekommt, sieht das Konto des Kollegen als weiteres Konto in seiner JMAP-Session.
Deshalb gelten in der Mail nur Konten von **Gruppen** als gemeinsame Postfächer (über
`Principal/get`). Kontakte und Termine werden immer pro Adressbuch bzw. Kalender abgefragt
(`inAddressBook`, `inCalendar`), auch die eigenen; so zeigt die App genau, was in den sichtbaren
Adressbüchern und Kalendern steht. Jeder Termin trägt das Konto, aus dem er kommt; Ändern,
Verschieben und Löschen gehen an dieses Konto.

Einen Termin in einem fremden Kalender darf man mit „Bearbeiten“ ändern, wenn man selbst oder der
Besitzer des Kalenders ihn organisiert. Zusagen und Absagen gibt es nur im eigenen Kalender.
Welche Kalender eingeblendet sind, merkt sich die App pro Gerät im Browser: Stalwart 0.16 lässt
das per Benutzer gespeicherte `isVisible` bei fremden Kalendern nur mit Schreibrecht ändern.

## Wiederkehrende Termine

Eine Serie ist in Stalwart **ein** Termin mit `recurrenceRule` (JSCalendar, RFC 8984; Stalwart
0.16 nimmt die Einzahl). Die Kalenderansichten fragen mit `expandRecurrences` ab und bekommen
jeden einzelnen Termin mit eigener ID, `baseEventId` und `recurrenceId`.

- **Nur dieser Termin**: Ändern oder Löschen über die ID des einzelnen Termins; Stalwart trägt das
  in `recurrenceOverrides` der Serie ein (beim Löschen als `excluded`).
- **Ganze Serie**: Ändern oder Löschen über die `baseEventId`. Wird dabei die Uhrzeit geändert,
  verschiebt sich der Beginn der Serie um denselben Betrag.
- Regeln, die das Formular nicht abbildet (etwa „letzter Freitag im Monat“ aus einem anderen
  Programm), bleiben beim Speichern unverändert.

Ziehen im Wochenraster ändert immer nur den einen Termin.

## Anmeldung

Benutzer und Passwörter bleiben in Stalwart. Bei der Anmeldung schickt die App E-Mail, Passwort
und – wenn eingerichtet – den Code der Authenticator-App an den Server
(`POST /api/auth/sign-in/stalwart`). Der meldet sich über Stalwarts OAuth an (Autorisierungscode
mit PKCE, ohne Umleitung), legt eine Better-Auth-Sitzung an und setzt ein httpOnly-Cookie. Die
Stalwart-Tokens liegen verschlüsselt (AES-GCM) in SQLite, je Sitzung. Der Zugriffstoken wird bei
Bedarf mit dem Refresh-Token erneuert; Stalwart verlängert diesen, solange er benutzt wird. So
bleibt die App am Handy angemeldet, bis man sich abmeldet (Sitzung 90 Tage, bei Nutzung erneuert).

**Passkeys später:** Better Auth bringt ein Passkey-Plugin mit. Beim Einrichten eines Passkeys legt
der Server in Stalwart ein App-Passwort für das Gerät an und speichert es verschlüsselt; eine
Passkey-Anmeldung holt damit den Stalwart-Token. Am Rest ändert sich nichts.

## Code

| Ordner          | Inhalt                                                                                                                     |
| --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `src/jmap/`     | JMAP-Client (Session, Methoden, Upload/Download, Push) und die Aufrufe für Mail, Kalender, Kontakte                        |
| `src/lib/`      | reine Funktionen: Ordnerbaum, Adressen, Antworten, HTML-Bereinigung, JSCalendar- und JSContact-Umrechnung – mit Unit-Tests |
| `src/features/` | die Ansichten von Mail, Kalender, Kontakten und Firmenverwaltung, je mit ihren Daten-Hooks (`queries.ts`)                 |
| `server/`       | Kontext-Server: Anmeldung, JMAP-Weiterleitung, Firmenverwaltung (`server/company/`)                                       |
| `src/routes/`   | TanStack-Router-Routen; der Zustand einer Ansicht steht in der URL (offene Mail, Ordner, Termin)                           |
| `dev/`          | lokaler Stalwart, Testdaten (Seed)                                                                                         |
| `deploy/`       | Caddy, Compose, Quadlets, Backup                                                                                           |
| `e2e/`          | Playwright-Tests gegen einen eigenen Stalwart                                                                              |
