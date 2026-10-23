# Entwicklung

Benötigt [Bun](https://bun.sh) 1.4 auf Linux oder macOS (Windows über WSL). Docker ist nicht
nötig: das Entwicklungsskript lädt Stalwart als einzelne Datei von GitHub.

```bash
bun install
bun run dev:stalwart -- --seed   # Stalwart auf 127.0.0.1:18080, mit Testdaten
bun run dev                      # Sekretär auf http://localhost:5173
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

## Testdaten

`bun run seed` (oder `--seed`) legt die Firma „Weber Haustechnik“ an: vier Mitarbeiter, die
gemeinsamen Postfächer info@ und rechnung@, Ordner, Mails mit Anhang, Kontakte und Termine der
laufenden Woche. Das Skript ist idempotent – es ergänzt nur, was fehlt.

| Anmeldung                                               | Passwort                    |
| ------------------------------------------------------- | --------------------------- |
| `jonas@weber-haustechnik.test` (Chef, info@, rechnung@) | `kaffee-werkbank-sekretaer` |
| `anna@weber-haustechnik.test` (Büro, info@, rechnung@)  | dasselbe                    |
| `sandra@…`, `max@…`                                     | dasselbe                    |

## Tests

|                 | Befehl                |                                                                                                             |
| --------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Typen           | `bun run typecheck`   | TypeScript strict                                                                                           |
| Format und Lint | `bun run lint`        | Biome                                                                                                       |
| Unit            | `bun run test`        | Vitest, für alles in `src/lib/` und die Protokoll-Helfer                                                    |
| End-to-End      | `bun run e2e`         | Playwright, Desktop und Handy (Pixel 7), gegen einen frisch angelegten Stalwart auf 28080 und Vite auf 5174 |
| Screenshots     | `bun run screenshots` | die Bilder in `docs/screenshots/`                                                                           |

`bun run check` macht die ersten vier Schritte und den Build.

## CI und Releases

- **CI** (`.github/workflows/ci.yml`): Typen, Lint, Unit-Tests und Build in einem Job; die
  E2E-Tests parallel im offiziellen Playwright-Image, Stalwart wird gecacht.
- **Screenshots**: Actions → _Update screenshots_ → Run workflow.
- **Release**: Tag `vX.Y.Z` (Version in `package.json`) baut das Image `tristanteu/sekretaer`
  für amd64 und arm64 und legt das GitHub-Release an.
