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
bun dev/fake-box.ts --code K7QM-4XPA                                  # Steuerung auf 18096
curl -XPOST localhost:18096/ring -d '{"from":"07223 81234"}'          # Petra Keller ruft an
curl -XPOST localhost:18096/hangup -d '{"call":"fake.1"}'             # sie legt auf
curl -XPOST localhost:18096/mailbox -d '{"call":"fake.1","seconds":5}' # oder spricht auf die Mailbox
```

Zu hören ist dabei nichts (lokal läuft kein LiveKit SIP). Die echte Box (`box/`, Asterisk und der
Agent) baut `docker build -f box/Dockerfile -t kontext-box .`; CI baut sie und prüft, ob Asterisk
mit PJSIP startet. Stalwarts eigenes Log steht in `.dev/stalwart.log`. Strg+C
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

## Datenbank des Servers

Der Server speichert nur Sitzungen (und später Passkeys) in SQLite, Standard
`.dev/server/kontext.db`. Das Schema steht in `server/db/schema.ts`; nach einer Änderung
`bunx drizzle-kit generate` – der Server spielt die Migrationen beim Start ein.

## Testdaten

`bun run seed` (oder `--seed`) legt die Firma „Weber Haustechnik“ an: vier Mitarbeiter, die
gemeinsamen Postfächer info@ und rechnung@, Ordner, Mails mit Anhang, einen HTML-Newsletter mit
Bildern aus dem Internet, eine Testmail voller XSS-Tricks, Kontakte mit den Gruppen „Lieferanten“
und „Team“, Termine der laufenden Woche, eine wöchentliche Teambesprechung und offene Einladungen. Das Skript ist idempotent – es ergänzt nur, was fehlt.

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
| App (PWA)       | `bun run e2e`         | `e2e/pwa.spec.ts` gegen die gebaute App wie in Produktion (Server auf 28090 liefert `dist/`): Updates, Offline-Start, Cache-Header, Teilen |
| Abhängigkeiten  | `bun audit`           | bekannte Lücken; in CI bei jedem Push und nachts                                                            |
| Screenshots     | `bun run screenshots` | die Bilder in `docs/screenshots/` und für den Installationsdialog in `public/screenshots/`                  |

`bun run check` macht Typen, Lint, Unit- und Komponententests und den Build. `bun run e2e` baut
die App vorher (`vite build`), weil die PWA-Tests den Service Worker brauchen, den es nur im Build
gibt; im Dev-Server ist er bewusst aus, damit Neuladen nichts aus einem Cache holt. Die lokale Instanz
erlaubt IMAP-Anmeldungen ohne TLS (nur auf 127.0.0.1), damit Mailprogramme und die
Integrationstests sich verbinden können.

## CI und Releases

- **CI** (`.github/workflows/ci.yml`): Typen, Lint, Unit-Tests, Build und `bun audit` in einem
  Job; die E2E- und Integrationstests parallel im offiziellen Playwright-Image, Stalwart wird
  gecacht. Nachts läuft alles noch einmal, damit neue Sicherheitsmeldungen auffallen.
- **Screenshots**: Actions → _Update screenshots_ → Run workflow.
- **Release**: Tag `vX.Y.Z` (Version in `package.json`) baut das Image `tristanteu/kontext`
  für amd64 und arm64 und legt das GitHub-Release an.
