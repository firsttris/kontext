# Entwicklung

Benötigt [Bun](https://bun.sh) 1.4 auf Linux oder macOS (Windows über WSL). Docker ist nicht
nötig: das Entwicklungsskript lädt Stalwart als einzelne Datei von GitHub.

```bash
bun install
bun run dev:stalwart -- --seed   # Stalwart auf 127.0.0.1:18080, mit Testdaten
bun run dev:server               # Sekretär-Server auf 127.0.0.1:18090 (Anmeldung, JMAP)
bun run dev                      # App auf http://localhost:5173
```

## Lokaler Stalwart

`dev/stalwart.ts` legt die Daten unter `.dev/stalwart/` ab. Beim ersten Start bootet es Stalwart
im Wiederherstellungsmodus, legt die Listener auf Ports über 1024 an (HTTP 18080, SMTP 10025,
IMAP 10143) und startet dann normal. Der Admin ist `admin` / `sekretaer-admin-dev`.

| Option                          |                                                     |
| ------------------------------- | --------------------------------------------------- |
| `--fresh`                       | Daten vorher löschen                                |
| `--seed`                        | Testdaten einspielen, sobald der Server läuft       |
| `--instance e2e --http 28080 …` | zweite, getrennte Instanz (so laufen die E2E-Tests) |

## Datenbank des Servers

Der Server speichert nur Sitzungen (und später Passkeys) in SQLite, Standard
`.dev/server/sekretaer.db`. Das Schema steht in `server/db/schema.ts`; nach einer Änderung
`bunx drizzle-kit generate` – der Server spielt die Migrationen beim Start ein.

## Testdaten

`bun run seed` (oder `--seed`) legt die Firma „Weber Haustechnik“ an: vier Mitarbeiter, die
gemeinsamen Postfächer info@ und rechnung@, Ordner, Mails mit Anhang, einen HTML-Newsletter mit
Bildern aus dem Internet, eine Testmail voller XSS-Tricks, Kontakte mit den Gruppen „Lieferanten“
und „Team“, Termine der laufenden Woche, eine wöchentliche Teambesprechung und offene Einladungen. Das Skript ist idempotent – es ergänzt nur, was fehlt.

| Anmeldung                                               | Passwort                    |
| ------------------------------------------------------- | --------------------------- |
| `jonas@weber-haustechnik.test` (Chef, info@, rechnung@, Firmenverwaltung) | `kaffee-werkbank-sekretaer` |
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
| End-to-End      | `bun run e2e`         | Playwright, Desktop und Handy (Pixel 7), gegen einen frisch angelegten Stalwart auf 28080 und Vite auf 5174 |
| Abhängigkeiten  | `bun audit`           | bekannte Lücken; in CI bei jedem Push und nachts                                                            |
| Screenshots     | `bun run screenshots` | die Bilder in `docs/screenshots/`                                                                           |

`bun run check` macht Typen, Lint, Unit- und Komponententests und den Build. Die lokale Instanz
erlaubt IMAP-Anmeldungen ohne TLS (nur auf 127.0.0.1), damit Mailprogramme und die
Integrationstests sich verbinden können.

## CI und Releases

- **CI** (`.github/workflows/ci.yml`): Typen, Lint, Unit-Tests, Build und `bun audit` in einem
  Job; die E2E- und Integrationstests parallel im offiziellen Playwright-Image, Stalwart wird
  gecacht. Nachts läuft alles noch einmal, damit neue Sicherheitsmeldungen auffallen.
- **Screenshots**: Actions → _Update screenshots_ → Run workflow.
- **Release**: Tag `vX.Y.Z` (Version in `package.json`) baut das Image `tristanteu/sekretaer`
  für amd64 und arm64 und legt das GitHub-Release an.
