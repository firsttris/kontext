---
description: >-
  Kontext entwickeln: lokaler Stalwart mit Testdaten, Kontext-Server und App mit bun run dev,
  Attrappen für Microsoft 365, Photon, Schreibzeug und die Telefonbox, Unit-, Komponenten- und
  E2E-Tests mit Playwright, CI und Releases.
---

# Entwicklung

Benötigt [Bun](https://bun.sh) 1.4 auf Linux oder macOS (Windows über WSL). Docker ist nicht
nötig: das Entwicklungsskript lädt Stalwart als einzelne Datei von GitHub. Für den Umzug aus
Outlook braucht der Server `readpst` (`sudo apt install pst-utils`, macOS: `brew install libpst`).
Die PST-Dateien für die Tests lädt `e2e/fixtures.ts` beim ersten Lauf nach `.dev/fixtures/`.
Den Umzug per IMAP probiert man lokal mit dem eigenen Stalwart als „altem Anbieter“ (Anderer
Server, `127.0.0.1`, Port 10143): dafür mit `MAIL_SYNC_ALLOW_PLAIN=true bun run dev` starten,
sonst verlangt er TLS und einen IMAP-Port. Weitere Postfächer gehen genauso; als SMTP-Server
dient dort ein Ersatz (`e2e/fake-smtp.ts`), weil Stalwart auf seinem Entwicklungs-Port keine
Anmeldung zum Senden annimmt. Für Microsoft 365 ersetzt `bun dev/fake-graph.ts`
(Port 18095) Microsofts Anmeldung und Graph; `bun run dev` dann zusätzlich mit
`M365_LOGIN_URL=http://127.0.0.1:18095 GRAPH_URL=http://127.0.0.1:18095/v1.0` starten und
Mandant `contoso`, Anwendung `kontext-test`, Schlüssel `geheim` eintragen.

Die Ortsvorschläge im Termin fragen in der Entwicklung das echte Photon (komoot); ohne Internet
ersetzt es `bun dev/fake-places.ts` (Port 18099, ein paar Orte um Freiburg), dann `bun run dev`
mit `PLACES_URL=http://127.0.0.1:18099/api/` starten. Die e2e-Tests nehmen es immer (28099).

Für das Modul „Dokumente“ ersetzt `bun dev/fake-schreibzeug.ts` (Port 18096) Schreibzeug: es meldet
sich über Kontexts Anbieter an (OIDC mit PKCE und `prompt=none`), spricht die Nachrichten des
Rahmens und nimmt Dateien mit Kontexts Tokens an. `bun run dev` dann mit
`SCHREIBZEUG_URL=http://localhost:18096 SCHREIBZEUG_CLIENT_SECRET=schreibzeug-dev-secret-only-for-local-tests-0123`
starten (das Geheimnis aus `dev/config.ts`, mit dem sich das Skript anmeldet). Mit dem echten Schreibzeug: dessen Server mit `OIDC_ISSUER=http://localhost:5173/api/auth`,
`OIDC_CLIENT_ID=schreibzeug`, `OIDC_CLIENT_SECRET`, `SCHREIBZEUG_EMBED_ORIGIN=http://localhost:5173`
und `SCHREIBZEUG_URL` (seine Vite-Adresse) starten, siehe
[Schreibzeug in Kontext](https://firsttris.github.io/schreibzeug/kontext/).

```bash
bun install
bun run dev   # Stalwart, Testdaten, Kontext-Server und App: http://localhost:5173
```

`bun run dev` (`dev/dev.ts`) startet alles in einem Terminal: zuerst Stalwart auf 18080 (beim
ersten Mal mit Download) und spielt die Testdaten ein – das ist idempotent, ein zweiter Start legt
nichts doppelt an. Daneben LiveKit für die Anrufe (`dev/livekit.ts`, 17880, Medien über TCP 17881
und UDP 17882, nur auf 127.0.0.1); unter Linux lädt das Skript die Release-Datei von GitHub, unter
macOS nimmt es `livekit-server` aus dem PATH (`brew install livekit`). Vite reicht `/rtc` an
LiveKit weiter, LiveKits Webhooks gehen an den Server. Danach starten der Kontext-Server auf 18090
(Anmeldung, JMAP; startet bei Änderungen neu) und Vite auf 5173. Einen Anruf probiert man mit
zwei Browserfenstern (eins privat), etwa Jonas und Anna.

Für die Telefonie gibt es eine Telefonbox als Attrappe (`dev/fake-box.ts`): Sie koppelt und
spricht mit dem Server wie die echte, klingelt aber nur auf Zuruf. Unter Einstellungen →
Telefonie „Box koppeln“, dann:

```bash
bun dev/fake-box.ts --code K7QM-4XPA                                  # Steuerung auf 18097
curl -XPOST localhost:18097/ring -d '{"from":"07223 81234"}'          # Petra Keller ruft an
curl -XPOST localhost:18097/hangup -d '{"call":"fake.1"}'             # sie legt auf
curl -XPOST localhost:18097/mailbox -d '{"call":"fake.1","seconds":5}' # oder spricht auf die Mailbox
```

Die Steuerung liegt auf 18097, damit die Attrappe neben `dev/fake-schreibzeug.ts` (18096) laufen
kann; ein anderer Port mit `--control <port>`. Die e2e-Tests nehmen 28096
(`e2e/phone.spec.ts`) und 28098 (Screenshots).

Zu hören ist dabei nichts (lokal läuft kein LiveKit SIP). Die echte Box (`box/`, Asterisk und der
Agent) baut `docker build -f box/Dockerfile -t kontext-box .`; CI baut sie und prüft, ob Asterisk
mit PJSIP startet, kein Modul beim Laden scheitert (`box/asterisk/modules.conf`) und der
Manager-Benutzer des Agents `command` darf – ohne das lehnt Asterisk sein `core reload` ab. Stalwarts eigenes Log steht in `.dev/stalwart.log`. Strg+C
beendet alles, und endet einer der Prozesse, stoppt auch der Rest.

Läuft schon ein Stalwart auf 18080, nimmt `bun run dev` diesen. So lässt sich Stalwart in einem
eigenen Terminal laufen lassen (`bun run dev:stalwart`, mit Log in der Konsole), während man den
Rest neu startet. Einzeln gehen auch `bun run dev:server` und `bun run dev:app`.

## Lokaler Stalwart

`dev/stalwart.ts` legt die Daten unter `.dev/stalwart/` ab. Beim ersten Start bootet es Stalwart
im Wiederherstellungsmodus, legt die Listener auf Ports über 1024 an (HTTP 18080, SMTP 10025,
IMAP 10143) und startet dann normal. Der Admin ist `admin` / `kontext-admin-dev`.

| Option                          |                                                     |
| ------------------------------- | --------------------------------------------------- |
| `--fresh`                       | Daten vorher löschen                                |
| `--seed`                        | Testdaten einspielen, sobald der Server läuft       |
| `--instance e2e --http 28080 …` | zweite, getrennte Instanz (so laufen die E2E-Tests) |

Der SMTP-Port verhält sich wie Port 25 eines echten Servers: Mails kommen ohne Anmeldung an, wie
von einem Mailserver im Internet, und Stalwart prüft SPF, DKIM, DMARC und Reverse DNS und schreibt
`Authentication-Results` dazu. Stalwart knüpft das an `local_port == 25`; das Skript erweitert
diese Regeln bei jedem Start um den Dev-Port. Der Spamfilter bleibt dort aus, weil er jede Mail
von einer `.test`-Domain in den Spam legt. So probiert man die Warnungen in der Mail aus, etwa
eine Mail, die sich als die eigene Firma ausgibt:

```bash
swaks --server 127.0.0.1:10025 --from chef@weber-haustechnik.test \
  --to jonas@weber-haustechnik.test --header "Subject: Dringend: Überweisung"
```

Die E2E-Tests stellen solche Mails mit `deliverMail` aus `e2e/protocols.ts` zu.

Wie auf einem Kundenserver schaltet das Skript Stalwarts RSVP-Seite aus (`x:CalendarScheduling`,
`httpRsvpEnable: false`); Einladungen verschickt Kontext (siehe
[Einladungen](architecture.md#einladungen)). Mails an Adressen außerhalb (etwa
`@hoffmann-bau.test`) kommen nirgends an, die Domains gibt es nicht; was hinausging, steht im
Gesendet-Ordner des Organisators – dort liest `e2e/invitations.spec.ts` die Einladungen und ihre
Antwort-Links.

## Datenbank des Servers

Der Server speichert in SQLite (Standard `.dev/server/kontext.db`) alles, was nicht in Stalwart
liegt: Sitzungen und die verschlüsselten Stalwart-Tokens, Einstellungen der Firma, Umzüge und
weitere Postfächer, Kategorien, Aufgaben, den Chat, Web-Push-Anmeldungen, Textbausteine,
Wiedervorlagen, Schlüssel und Zertifikate für PGP und S/MIME, vertraulich gesendete Mails, die
Telefonie, die Ordner in Dokumente und die Schlüssel und das Protokoll der Agenten. Das Schema
steht in `server/db/schema.ts`; nach einer Änderung `bunx drizzle-kit generate` – der Server
spielt die Migrationen beim Start ein.

## Testdaten

`bun run seed` (oder `--seed`) legt die Firma „Weber Haustechnik“ an: vier Mitarbeiter, die
gemeinsamen Postfächer info@ und rechnung@, Ordner, Mails mit Anhang, einen HTML-Newsletter mit
Bildern aus dem Internet, eine Testmail voller XSS-Tricks, Kontakte mit den Gruppen „Lieferanten“
und „Team“, Termine der laufenden Woche, eine wöchentliche Teambesprechung und offene Einladungen. Anna hat
heute von 13:30 bis 15 Uhr einen eigenen Termin, damit Film und Screenshot zu jeder Tageszeit einen
belegten Kollegen zeigen: Für einen Termin, der beim Seed schon vorbei ist, verschickt Stalwart keine
Einladung. Das Skript ist idempotent – es ergänzt nur, was fehlt.

| Anmeldung                                               | Passwort                    |
| ------------------------------------------------------- | --------------------------- |
| `jonas@weber-haustechnik.test` (Chef, info@, rechnung@, Firmenverwaltung) | `kaffee-werkbank-kontext` |
| `anna@weber-haustechnik.test` (Büro, info@, rechnung@)  | dasselbe                    |
| `sandra@…`, `max@…`                                     | dasselbe                    |

## Tests

|                 | Befehl                |                                                                                                             |
| --------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Typen           | `bun run typecheck`   | TypeScript strict                                                                                           |
| Format und Lint | `bun run lint`        | Biome                                                                                                       |
| Unit            | `bun run test`        | Vitest, für alles in `src/lib/` und die Protokoll-Helfer                                                    |
| Komponenten     | `bun run test`        | Vitest mit Testing Library für UI-Bausteine ohne Server (Empfängerfeld, Tastaturkürzel)                     |
| Integration     | `bun run e2e`         | `e2e/integration.spec.ts`: JMAP-Funktionen, IMAP (gemeinsame Postfächer), CalDAV und CardDAV gegen Stalwart |
| End-to-End      | `bun run e2e`         | Playwright, Desktop und Handy (Pixel 7), gegen einen frisch angelegten Stalwart auf 28080, LiveKit auf 27880 und Vite auf 5174; Chromium mit unechter Kamera und Mikrofon |
| Dokumente       | `bun run e2e`         | `e2e/documents.spec.ts` und `e2e/documents-links.spec.ts` gegen `dev/fake-schreibzeug.ts` (28097): Anmeldung über Kontexts Anbieter, Rahmen, Anhänge ablegen und anhängen, Abmelden, Dokumente in Chat, Aufgaben, Terminen und an Kontakten mit ihren Freigaben, der Ordner von info@ |
| Orte            | `bun run e2e`         | `e2e/places.spec.ts` gegen `dev/fake-places.ts` (28099, statt Photon): Vorschlag wählen, Escape, „In Karten öffnen“, am Desktop und am Handy |
| Barrierefreiheit | `bun run e2e`        | `e2e/accessibility.spec.ts`: axe-core prüft jede Seite hell und dunkel, am Desktop und am Handy, gegen WCAG 2.2 AA; `e2e/keyboard.spec.ts`: die Wege nur mit der Tastatur ([Barrierefreiheit](accessibility.md)) |
| App (PWA)       | `bun run e2e`         | `e2e/pwa.spec.ts` gegen die gebaute App wie in Produktion (Server auf 28090 liefert `dist/`): Updates, Offline-Start, Cache-Header, Brotli, was vorab gecacht wird, Teilen |
| Abhängigkeiten  | `bun audit`           | bekannte Lücken; in CI bei jedem Push und nachts                                                            |
| Screenshots     | `bun run screenshots` | die Bilder in `docs/screenshots/` und für den Installationsdialog in `public/screenshots/`                  |
| Film            | `bun run video`       | der Film oben auf der Startseite der Doku, deutsch und englisch, `docs/assets/kontext-film.*` (siehe [Film](#film)) |

Vor dem ersten `bun run e2e` (oder `bun run screenshots`) einmal Playwrights Chromium laden:
`bunx playwright install chromium`. Wer schon ein Chromium hat, zeigt stattdessen mit
`PW_CHROMIUM_PATH=/pfad/zu/chromium` darauf (`playwright.config.ts`). In CI laufen die Tests im
offiziellen Playwright-Image, das den Browser mitbringt.

`bun run check` macht Typen, Lint, Unit- und Komponententests und den Build. `bun run e2e` baut
die App vorher (`bun run build`: `vite build`, dann Brotli und gzip vorab, `dev/precompress.ts`), weil die PWA-Tests den Service Worker brauchen, den es nur im Build
gibt; im Dev-Server ist er bewusst aus, damit Neuladen nichts aus einem Cache holt. Die übrigen
Tests laufen dann auch gegen die gebaute App (`vite preview`, `E2E_BUILT=1`), die sofort lädt,
statt jedes Modul erst beim ersten Aufruf zu übersetzen; ihr Service Worker ist dort blockiert.
Wer `playwright test` direkt startet, bekommt den Dev-Server. Angemeldet wird jede Person einmal
pro Testlauf über das Formular; danach starten ihre Tests mit den Cookies dieser Sitzung
(`login` in `e2e/helpers.ts`), und nach Abmelden, Sperren oder neuem Passwort wieder mit dem
Formular. Ob eine aufbewahrte Sitzung noch gilt, fragt `login` den Server (`/jmap/session`), statt
abzuwarten, wohin die App springt – das lief um die Wette mit ihrer eigenen Weiterleitung.

### Robuste E2E-Tests

Alle Tests eines CI-Teils teilen sich einen Stalwart und eine Server-Datenbank, und ein
fehlgeschlagener Test läuft in der CI einmal neu – im Zustand, den der erste Versuch hinterlassen
hat. Darum:

- **Die Testdaten sind nur zum Lesen da.** Wer etwas anlegt oder ändert, bringt es selbst mit und
  benennt es eindeutig (`unique()`, `addMail()` in `e2e/helpers.ts`), statt Seed-Mails zu
  beantworten oder zu verschieben – andere Tests rechnen mit ihnen.
- **Ein Test fängt sauber an.** Was ein früherer Versuch angelegt haben kann (eigener Schlüssel,
  Zertifikat, Ordner im „alten Anbieter“), räumt er zu Beginn über die API weg.
- **Auf Zustände warten, nicht auf Zeit.** Für Arbeit im Hintergrund (Autocrypt, Abgleich,
  Zustellung) `expect.poll` auf die API statt fester Pausen; `waitForTimeout` nur, um zu zeigen,
  dass in einer Zeit *nichts* passiert.
- **Mit der sofortigen Anzeige rechnen.** Eine eigene Chat-Nachricht steht sofort da
  (`data-message="pending-…"`) und kurz neben der des Servers; gesucht wird die des Servers
  (`:not([data-message^="pending-"])`) oder bewusst `.last()`.
- **Nachts dreimal.** Der nächtliche CI-Lauf führt jeden E2E-Test dreimal und ohne Wiederholung
  aus (`--repeat-each=3 --retries=0`); was dort mal fehlschlägt, ist wackelig und wird repariert,
  nicht übersprungen. Lokal geht das mit `bun run e2e --repeat-each=3`.

Die lokale Instanz
erlaubt IMAP-Anmeldungen ohne TLS (nur auf 127.0.0.1), damit Mailprogramme und die
Integrationstests sich verbinden können.

## Film

Der Film oben auf der Startseite entsteht wie die Screenshots aus der echten App mit den
Testdaten, nicht aus einer Bildschirmaufnahme, einmal auf Deutsch und einmal auf Englisch
(`FILM_LANG=de` oder `en`, `video/language.ts`): `bun run video` macht beide nacheinander,
`bun run video:de` oder `video:en` nur einen. Im englischen Film läuft der Browser auf `en-GB`, die
App ist englisch, und Titel, Untertitel und getippte Texte kommen aus `say("…", "…")`; die
Testdaten von Weber Haustechnik bleiben deutsch. Die Aufnahmen finden die Bedienelemente über die
Texte der App selbst (`ui("mail_inbox")` aus `messages/*.json`), damit beide Sprachen dieselben
Schritte gehen. Jede Sprache hat ihre Dateien: `docs/assets/kontext-film.de.mp4` und `.en.mp4`, die
Vorschaubilder `.jpg` und die Teaser `kontext-teaser.de.webp` (`README.de.md`) und `.en.webp`
(`README.md`); `docs/index.md` zeigt den deutschen, `docs/index.en.md` den englischen Film. Beide
verweisen auf `assets/kontext-film.mp4` ohne Sprache: mkdocs-static-i18n veröffentlicht
`kontext-film.de.mp4` unter `assets/kontext-film.mp4` und `kontext-film.en.mp4` unter
`en/assets/kontext-film.mp4`; `assets/kontext-film.de.mp4` gibt es auf der Seite nicht. Zwei
Schritte je Sprache:

1. **Aufnehmen** (`bun run video:record`, das Playwright-Projekt `video`): `e2e/video.spec.ts` ruft
   für jede Szene eine Aufnahme aus `video/takes/` auf. Sie bedient die App Schritt für Schritt und
   macht nach jedem Schritt ein scharfes Bild (doppelte Pixel am Desktop, dreifache am Handy), dazu,
   wohin der Zeiger klickt und wohin die Kamera schaut (`video/take.ts`). Alles landet in
   `.dev/video/takes/<Sprache>/<Szene>/`. `TAKE=chat FILM_LANG=en bun run video:record` nimmt nur
   eine Szene neu auf.
   Der Videoanruf läuft wirklich über LiveKit, mit gezeichneten Personen als Kamera
   (`video/camera.ts`); die KI-Szene ruft Kontexts MCP-Server wirklich auf, nur das Chatfenster des
   Assistenten daneben ist gezeichnet (`video/panels.ts`), ebenso die Karte mit dem, was der Server
   von einer vertraulichen Nachricht speichert – dessen Inhalt kommt aus der API. In der Dokumente-Szene zeigt Kontexts Rahmen Bilder des echten Schreibzeug (`video/schreibzeug/`, aus `docs/screenshots/` von firsttris/schreibzeug), weil der Ersatz in den Tests nur sagt, wer angemeldet ist.
2. **Rendern** (`bun run video:render`, `video/render.ts`): Die Bühne (`video/stage/`) legt die Bilder
   in Browserfenster und Handys, bewegt Zeiger und Kamera, blendet über und setzt Titel und
   Untertitel. Sie ist eine Seite in Chromium, die zu jeder Zeit ein festes Bild zeigt
   (`window.film.render(t)`, die Zeitrechnung in `video/stage/timeline.ts`); gerendert wird Bild für
   Bild, ffmpeg macht daraus ein MP4 (H.264, spielt überall), ein Vorschaubild und einen kurzen Zusammenschnitt als animiertes WebP für die READMEs (`docs/assets/kontext-teaser.<Sprache>.webp`; GitHub spielt kein Video aus dem Repository ab, zeigt aber animierte Bilder). Welche Stellen in den Zusammenschnitt kommen, steht in `teaser` in `video/storyboard.ts`. Er läuft mit 30 Bildern pro Sekunde wie der Film – mit weniger ruckeln Kamera und Zeiger; `--teaser` schneidet ihn neu, ohne den Film neu zu rendern. Das WebP macht `img2webp` aus libwebp mit einem Schlüsselbild alle acht Bilder: ffmpegs eigenes animiertes WebP hat nur eines am Anfang und übernimmt danach kleine Änderungen nicht, so blieben bei langsamen Überblendungen und Kamerafahrten alte Blöcke stehen. Mit
   `--stills 12,40.5` entstehen einzelne Bilder in `.dev/video/stills/<Sprache>/`, mit `--from 20 --to 35
   --out .dev/video/teil.mp4` ein Ausschnitt.

Reihenfolge, Titel und Untertitel stehen in `video/storyboard.ts` und bei den Schritten der
Aufnahmen: kurz, weil die meisten den Film ohne Ton sehen. Nach einer Änderung am Aussehen der App:
Actions → _Update video_ → Run workflow (oder `bun run video`, braucht ffmpeg und img2webp, Paket
`webp`), dann beide Filme ansehen.

## CI und Releases

- **CI** (`.github/workflows/ci.yml`): Typen, Lint, Unit-Tests, Build und `bun audit` in einem
  Job; die E2E- und Integrationstests parallel im offiziellen Playwright-Image, in vier Teilen
  gleichzeitig (`bun run e2e --shard=1/4` … `4/4`, jeder mit eigenem Stalwart und frischen
  Testdaten; Dateien bleiben ganz in einem Teil), Stalwart wird gecacht. Der Check „End-to-end
  tests (Stalwart + Playwright)“ fasst die vier zusammen. Pull Requests im Entwurf bauen nicht,
  erst „Ready for review“ startet den Lauf; ein neuer Push bricht den alten Lauf eines Pull Requests
  ab, Läufe auf `main` laufen zu Ende. Nachts läuft alles noch einmal, damit neue Sicherheitsmeldungen auffallen, die
  E2E-Tests dabei dreimal ohne Wiederholung (siehe [Robuste E2E-Tests](#robuste-e2e-tests)).
  Ändert ein Push oder Pull Request nur Text (Markdown-Dateien, `docs/`, `LICENSE`), läuft die CI
  nicht; ein Release danach testet dann selbst, bevor es baut.
- **Dokumentation** (`.github/workflows/docs.yml`): jeder Pull Request und jeder Push auf `main`,
  der `docs/` oder `mkdocs.yml` ändert, baut die Seiten mit MkDocs Material (`--strict`); auf `main`
  werden sie danach auf GitHub Pages veröffentlicht (einmalig: Settings → Pages → Source „GitHub Actions“). Lokal: `pip install mkdocs-material
  mkdocs-static-i18n && mkdocs serve`. Deutsch steht unter `/`, Englisch unter `/en/`: Übersetzt wird
  eine Seite mit einer Datei daneben (`index.en.md` zu `index.md`); ohne sie zeigt die englische
  Seite den deutschen Text. Die Startseite ist der Rundgang in Bildern, `ueberblick.md` die Übersicht.
- **Screenshots**: Actions → _Update screenshots_ → Run workflow (oder `bun run screenshots`, lokal mit
  `PW_CHROMIUM_PATH`, wenn Playwrights eigener Browser fehlt).
- **Film**: Actions → _Update video_ → Run workflow (oder `bun run video`, siehe [Film](#film)).
- **Release**: Actions → _Bump version_ → Run workflow auf `main` und `patch`, `minor` oder `major`
  wählen (für einen Release Candidate `preminor`, dann `prerelease`, am Ende `patch`). Der Lauf hebt
  die Version in `package.json`, committet sie als „Release vX.Y.Z“, setzt den Tag und startet
  _Release_ (`.github/workflows/release.yml`) darauf. Das ist der Weg für ein Release. Die Skripte
  `release:patch` (`:minor`, `:major`) in `package.json` rufen `npm version` auf, brauchen also
  npm, und pushen Commit und Tag direkt auf `main` – an Pull Requests vorbei; sie nicht nehmen.
- **Was das Release veröffentlicht:** Es überspringt die CI, wenn `main` den Stand schon grün
  getestet hat, und baut für `linux/amd64` und `linux/arm64` die Images
  `docker.io/tristanteu/kontext` und `ghcr.io/firsttris/kontext` (Docker Hub und GitHub Container
  Registry) sowie `docker.io/tristanteu/kontext-box` (nur Docker Hub; in GHCR liegt nur sein
  Build-Cache), jeweils mit den Tags `X.Y.Z`, `X.Y` und `latest` (ein Release Candidate nur `X.Y.Z-rc…` und
  `next`). Dazu legt es das GitHub-Release an und setzt danach `KONTEXT_VERSION` in
  `deploy/.env.example` und das Image in `deploy/quadlet/kontext.container` auf die neue Version
  (Commit „deploy: images of vX.Y.Z“ auf `main`). Die Abläufe kommen aus
  [firsttris/workflows](https://github.com/firsttris/workflows) (`docker-release.yml`,
  `bump-version.yml`).
