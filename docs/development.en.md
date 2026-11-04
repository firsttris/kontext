---
description: >-
  Developing Kontext: a local Stalwart with test data, the Kontext server and the app with bun run
  dev, stand-ins for Microsoft 365, Photon, Schreibzeug and the phone box, unit, component and
  E2E tests with Playwright, CI and releases.
---

# Development { #entwicklung }

Needs [Bun](https://bun.sh) 1.4 on Linux or macOS (Windows through WSL). Docker is not needed:
the development script downloads Stalwart as a single file from GitHub. For the move from
Outlook the server needs `readpst` (`sudo apt install pst-utils`, macOS: `brew install libpst`).
`e2e/fixtures.ts` downloads the PST files for the tests to `.dev/fixtures/` on the first run.
You try the move over IMAP locally with your own Stalwart as the "old provider" (Other server,
`127.0.0.1`, port 10143): start with `MAIL_SYNC_ALLOW_PLAIN=true bun run dev` for that, otherwise
it requires TLS and an IMAP port. Other mailboxes work the same way; a stand-in
(`e2e/fake-smtp.ts`) serves as the SMTP server there, because Stalwart accepts no sign-in for
sending on its development port. For Microsoft 365, `bun dev/fake-graph.ts` (port 18095) stands
in for Microsoft's sign-in and Graph; then start `bun run dev` with
`M365_LOGIN_URL=http://127.0.0.1:18095 GRAPH_URL=http://127.0.0.1:18095/v1.0` as well and enter
tenant `contoso`, application `kontext-test`, secret `geheim`.

In development, the place suggestions in an appointment ask the real Photon (komoot); without
internet, `bun dev/fake-places.ts` stands in for it (port 18099, a few places around Freiburg),
then start `bun run dev` with `PLACES_URL=http://127.0.0.1:18099/api/`. The e2e tests always use
it (28099).

For the "Documents" module, `bun dev/fake-schreibzeug.ts` (port 18096) stands in for
Schreibzeug: it signs in through Kontext's provider (OIDC with PKCE and `prompt=none`), speaks
the frame's messages and accepts files with Kontext's tokens. Then start `bun run dev` with
`SCHREIBZEUG_URL=http://localhost:18096 SCHREIBZEUG_CLIENT_SECRET=schreibzeug-dev-secret-only-for-local-tests-0123`
(the secret from `dev/config.ts` that the script signs in with). With the real Schreibzeug: start its server with `OIDC_ISSUER=http://localhost:5173/api/auth`,
`OIDC_CLIENT_ID=schreibzeug`, `OIDC_CLIENT_SECRET`, `SCHREIBZEUG_EMBED_ORIGIN=http://localhost:5173`
and `SCHREIBZEUG_URL` (its Vite address), see
[Schreibzeug in Kontext](https://firsttris.github.io/schreibzeug/kontext/).

```bash
bun install
bun run dev   # Stalwart, test data, Kontext server and app: http://localhost:5173
```

`bun run dev` uses `bun run --parallel` to start everything side by side in one terminal, each
line prefixed with the name of its script:

| Script              | What it does                                                                       |
| ------------------- | ---------------------------------------------------------------------------------- |
| `dev:stalwart:seed` | Stalwart on 18080 (with a download the first time), then the test data             |
| `dev:livekit`       | LiveKit for calls; if it is missing, everything but calls works                    |
| `dev:server`        | the Kontext server on 18090 (sign-in, JMAP; restarts on changes)                   |
| `dev:app`           | Vite on 5173                                                                       |
| `dev:demo`          | waits for the test data and the server, creates tasks and chat, and exits          |

Loading the test data is idempotent; a second start creates nothing twice. LiveKit
(`dev/livekit.ts`) listens on 17880, media over TCP 17881 and UDP 17882, only on 127.0.0.1; on
Linux the script downloads the release file from GitHub, on macOS it takes `livekit-server` from
the PATH (`brew install livekit`). If it can't be downloaded, doesn't start or exits, `dev:livekit`
says so and exits with 0, and the rest keeps running. Vite passes `/rtc` on to LiveKit, and
LiveKit's webhooks go to the server. You try a call with
two browser windows (one private), Jonas and Anna for instance.

For telephony there is a stand-in phone box (`dev/fake-box.ts`): it pairs and talks to the
server like the real one, but only rings when told to. Under Settings → Telephony, "Pair box",
then:

```bash
bun dev/fake-box.ts --code K7QM-4XPA                                  # control on 18097
curl -XPOST localhost:18097/ring -d '{"from":"07223 81234"}'          # Petra Keller calls
curl -XPOST localhost:18097/hangup -d '{"call":"fake.1"}'             # she hangs up
curl -XPOST localhost:18097/mailbox -d '{"call":"fake.1","seconds":5}' # or leaves a voicemail
```

The control is on 18097 so that the stand-in can run next to `dev/fake-schreibzeug.ts` (18096);
another port with `--control <port>`. The e2e tests use 28096 (`e2e/phone.spec.ts`) and 28098
(screenshots).

There is nothing to hear (no LiveKit SIP runs locally). The real box (`box/`, Asterisk and the
agent) is built with `docker build -f box/Dockerfile -t kontext-box .`; CI builds it and checks
that Asterisk starts with PJSIP, that no module fails to load (`box/asterisk/modules.conf`) and
that the agent's manager user is allowed `command` – without that, Asterisk rejects its
`core reload`. Stalwart's own log is in `.dev/stalwart.log`. Ctrl+C
stops everything, Ctrl+Z suspends everything (continue with `fg`): the terminal sends both to all
processes in the foreground. If one of the scripts fails, `bun run --parallel` stops the rest; a
script that exits with 0 (`dev:demo`, a shared Stalwart, a shared or missing LiveKit) leaves the
others running.

If a Stalwart is already running on 18080, `bun run dev` uses it and only loads the test data;
if another service answers there, `bun run dev` aborts with the port and the reason.
That way you can keep Stalwart running in a terminal of its own (`bun run dev:stalwart`, with
the log in the console) while restarting the rest. `bun run dev:server` and `bun run dev:app`
also work on their own. Vite's keyboard shortcuts (`h`, `r`, `o`, `q`) only exist with
`bun run dev:app` alone: under `bun run --parallel` no script gets the keyboard.

## Local Stalwart { #lokaler-stalwart }

`dev/stalwart.ts` keeps the data under `.dev/stalwart/`. On the first start it boots Stalwart in
recovery mode, sets up the listeners on ports above 1024 (HTTP 18080, SMTP 10025, IMAP 10143) and
then starts it normally. The admin is `admin` / `kontext-admin-dev`. On every start it registers
Kontext as OAuth client `kontext` if it is missing, and allows directory queries, with
the same code as the [setup command](installation.md#einrichtungsbefehl) (`server/stalwart-setup.ts`).

A new Stalwart doesn't open the data of an older Stalwart major version (since 1.0: `The data
store was created by a Stalwart version prior to 1.0`, in `.dev/stalwart.log`). After such an
update, run `bun dev/stalwart.ts --fresh --seed` once.

| Option                          |                                                     |
| ------------------------------- | --------------------------------------------------- |
| `--fresh`                       | delete the data first                               |
| `--seed`                        | load the test data as soon as the server runs       |
| `--instance e2e --http 28080 …` | a second, separate instance (how the E2E tests run) |

The SMTP port behaves like port 25 of a real server: mail arrives without sign-in, as from a
mail server on the internet, and Stalwart checks SPF, DKIM, DMARC and reverse DNS and adds
`Authentication-Results`. Stalwart ties this to `local_port == 25`; on every start the script
extends these rules with the dev port. The spam filter stays off there, because it puts every
mail from a `.test` domain into spam. This is how you try out the warnings in a mail, for
instance a mail pretending to be from your own company:

```bash
swaks --server 127.0.0.1:10025 --from chef@weber-haustechnik.test \
  --to jonas@weber-haustechnik.test --header "Subject: Dringend: Überweisung"
```

The E2E tests deliver such mails with `deliverMail` from `e2e/protocols.ts`.

As on a customer server, the script turns off Stalwart's RSVP page (`x:CalendarScheduling`,
`httpRsvpEnable: false`); Kontext sends the invitations (see
[Invitations](architecture.md#einladungen)). Mail to outside addresses (such as
`@hoffmann-bau.test`) arrives nowhere, as those domains don't exist; what went out is in the
organizer's Sent folder – that is where `e2e/invitations.spec.ts` reads the invitations and
their reply links.

## The server's database { #datenbank-des-servers }

The server stores in SQLite (by default `.dev/server/kontext.db`) everything that isn't in
Stalwart: sessions and the encrypted Stalwart tokens, the company's settings, moves and other
mailboxes, categories, tasks, the chat, web push subscriptions, snippets, follow-ups, keys and
certificates for PGP and S/MIME, confidentially sent mails, telephony, the folders in Documents,
and the agents' keys and log. The schema is in `server/db/schema.ts`; after a change, run
`bunx drizzle-kit generate` – the server applies the migrations on start.

## Test data { #testdaten }

`bun run seed` (or `--seed`) creates the company "Weber Haustechnik": four employees, the shared
mailboxes info@ and rechnung@, folders, mails with attachments, an HTML newsletter with images
from the internet, a test mail full of XSS tricks, contacts with the groups "Lieferanten"
(suppliers) and "Team" (three with a birthday in the coming weeks), appointments in the current
week, a weekly team meeting and open invitations. Anna has
an appointment of her own today from 13:30 to 15:00, so that the film and the screenshot show a
busy colleague at any time of day: Stalwart sends no invitation for an appointment that is
already over when the seed runs. The script is idempotent – it only adds what is missing.

Tasks and chat are not in Stalwart but in the Kontext server's database; the seed doesn't reach
them. So `bun run dev` creates them after the start (`dev:demo`, `dev/fill-demo.ts`), as soon as
the test data is in Stalwart and the server answers (`dev/demo-data.ts`): the tasks on info@'s board and on Jonas's own, the channel
`#baustelle-hoffmann` with a site measurement, a mail card and a task made from a message, a word in info@
and `#allgemein`, and a direct message to Jonas. For this the four sign in through
`POST /api/auth/sign-in/stalwart`, like the sign-in form. This happens only once per database:
if #baustelle-hoffmann is already there, everything stays as it is. To start over, delete
`.dev/server/`. The screenshots and the film use the same data (`e2e/demo-data.ts`); the e2e
tests don't – they expect an empty chat and empty tasks, and their seed
(`dev/stalwart.ts --seed`) only fills Stalwart.

| Sign-in                                                 | Password                    |
| ------------------------------------------------------- | --------------------------- |
| `jonas@weber-haustechnik.test` (boss, info@, rechnung@, company admin) | `kaffee-werkbank-kontext` |
| `anna@weber-haustechnik.test` (office, info@, rechnung@) | the same                   |
| `sandra@…`, `max@…`                                     | the same                    |

## Demo { #demo }

The [demo](https://firsttris.github.io/kontext/demo/) is the app without a server: a build of
its own (`bun run build:demo`, Vite mode `demo`, to `dist-demo/`) answers the requests to `/jmap`
and `/api` inside the page itself (`src/demo/`). The data is the test data from
`dev/seed-data.ts` without the XSS test mail, as JMAP objects in the browser; reloading starts
over. You sign in with one click as Jonas, Anna, Sandra or Max.

- **What works:** mail – folders, shared mailboxes, reading with attachments and PDF preview,
  search, flags, categories, moving (between mailboxes too), drafts and sending with
  "Undo" and "Schedule send". A mail to colleagues or to info@/rechnung@ arrives there;
  everything else goes nowhere.
- **Calendar and contacts:** the appointments and contacts of the test data (the same cards and
  appointments as in the seed, `dev/seed-objects.ts`), recurrences with single occurrences
  changed or deleted, invitations among colleagues with acceptance and decline, availability
  when planning, and the birthdays. An appointment is in the calendar of every colleague it
  concerns – as with Stalwart over iTIP; what one of them changes, the others see. The app sends
  the invitation mails itself (`Email/import`, read with postal-mime).
- **Documents:** the frame shows the [Schreibzeug demo](https://firsttris.github.io/schreibzeug/demo/),
  just as static and with sample files of its own. Its pages sit behind `#`; Kontext puts the
  page there and `?embedded=kontext` in front of it (`frameSrcOf`, `src/features/documents/messages.ts`).
  Moving files back and forth between mail and documents only works with both servers (`connected: false`).
- **Chat and tasks:** the Kontext server's own routes (`server/chat/routes.ts`,
  `server/tasks/routes.ts`), in the browser on in-memory stores
  (`server/chat/memory-store.ts`, `server/tasks/memory-store.ts`, the same as in their tests).
  As on the development server, they are filled by the people themselves through these routes
  (`fillWith` in `dev/demo-data.ts`): #baustelle-hoffmann with a site measurement and a mail card,
  info@, #allgemein, a direct message from Sandra, the boards' tasks. Writing, reactions,
  threads, files and new tasks work; what others are doing right now doesn't come through – the
  demo has no live connection, and only one person is ever signed in.
- **Phone:** the module as with a phone box in the office, with the calls of the last few days
  (answered, missed with a voicemail, dialled, the door), status, notes and statistics
  (`src/demo/phone.ts`). Nothing rings, and dialling doesn't work without a phone box.
  The voicemail plays a recording that comes with the demo
  (`src/demo/voicemail.m4a`, spoken with [Piper](https://github.com/rhasspy/piper), voice
  "kerstin", CC0). An `<audio>` loads its sound itself, bypassing the demo's `fetch`; that is why
  every player with `src="/api/…"` gets the demo's answer as a blob URL (`src/demo/media.ts`).
- **What is still missing:** video calls and the company admin.
  Methods the demo doesn't know it answers like an empty server (`src/demo/jmap.ts`);
  modules that need a service of their own (calls, phone, documents with Schreibzeug) are
  turned off as on a server without them (`src/demo/api.ts`).
- **New server route:** if the app asks for a new `/api` route on start, it needs an answer in
  `src/demo/api.ts`; otherwise `[demo] GET /api/…` appears in the console.
- **Trying it out:** `bun run build:demo`, then serve `dist-demo/` under `/kontext/demo/`
  (or under `/` with `DEMO_BASE=/ bun run build:demo`). The routes sit behind `#` because GitHub
  Pages has no fallback to `index.html`; the demo has no service worker.
- **Published** by the docs workflow on every push to `main`, next to the docs under
  `/kontext/demo/`.

## Tests { #tests }

|                 | Command               |                                                                                                             |
| --------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Types           | `bun run typecheck`   | TypeScript strict                                                                                           |
| Format and lint | `bun run lint`        | Biome                                                                                                       |
| Unit            | `bun run test`        | Vitest, for everything in `src/lib/` and the protocol helpers                                               |
| Components      | `bun run test`        | Vitest with Testing Library for UI pieces without a server (recipient field, keyboard shortcuts)            |
| Integration     | `bun run e2e`         | `e2e/integration.spec.ts`: JMAP functions, IMAP (shared mailboxes), CalDAV and CardDAV against Stalwart      |
| End-to-end      | `bun run e2e`         | Playwright, desktop and phone (Pixel 7), against a freshly created Stalwart on 28080, LiveKit on 27880 and Vite on 5174; Chromium with a fake camera and microphone |
| Documents       | `bun run e2e`         | `e2e/documents.spec.ts` and `e2e/documents-links.spec.ts` against `dev/fake-schreibzeug.ts` (28097): sign-in through Kontext's provider, frame, saving and attaching attachments, sign-out, documents in chat, tasks, appointments and on contacts with their sharing, info@'s folder |
| Places          | `bun run e2e`         | `e2e/places.spec.ts` against `dev/fake-places.ts` (28099, instead of Photon): picking a suggestion, Escape, "Open in Maps", on desktop and phone |
| Accessibility   | `bun run e2e`         | `e2e/accessibility.spec.ts`: axe-core checks every page, light and dark, on desktop and phone, against WCAG 2.2 AA; `e2e/keyboard.spec.ts`: the paths with the keyboard only ([Accessibility](accessibility.md)) |
| App (PWA)       | `bun run e2e`         | `e2e/pwa.spec.ts` against the built app as in production (server on 28090 serves `dist/`): updates, offline start, cache headers, Brotli, what is precached, sharing |
| Dependencies    | `bun audit`           | known vulnerabilities; in CI on every push and nightly                                                      |
| Screenshots     | `bun run screenshots` | the pictures in `docs/screenshots/` and for the install dialog in `public/screenshots/`                     |
| Film            | `bun run video`       | the film at the top of the docs' home page, German and English, `docs/assets/kontext-film.*` (see [Film](#film)) |

Before the first `bun run e2e` (or `bun run screenshots`), download Playwright's Chromium once:
`bunx playwright install chromium`. If you already have a Chromium, point to it instead with
`PW_CHROMIUM_PATH=/pfad/zu/chromium` (`playwright.config.ts`). In CI the tests run in the
official Playwright image, which comes with the browser.

`bun run check` does types, lint, unit and component tests, and the build. `bun run e2e` builds
the app first (`bun run build`: `vite build`, then Brotli and gzip in advance, `dev/precompress.ts`), because the PWA tests need the service worker, which only exists in the build;
in the dev server it is deliberately off, so that reloading fetches nothing from a cache. The
other tests then run against the built app too (`vite preview`, `E2E_BUILT=1`), which loads at
once instead of compiling each module on first use; its service worker is blocked there.
If you start `playwright test` directly, you get the dev server. Each person signs in once per
test run through the form; after that their tests start with that session's cookies (`login` in
`e2e/helpers.ts`), and after signing out, locking or a new password, with the form again. To
find out whether a kept session is still valid, `login` asks the server (`/jmap/session`)
instead of waiting to see where the app jumps – that raced against the app's own redirect.

### Robust E2E tests { #robuste-e2e-tests }

All the tests of a CI shard share one Stalwart and one server database, and a failed test runs
once more in CI – in the state the first attempt left behind. Hence:

- **The test data is read-only.** A test that creates or changes something brings it along
  itself and gives it a unique name (`unique()`, `addMail()` in `e2e/helpers.ts`), instead of
  replying to or moving seed mails – other tests count on them.
- **A test starts clean.** What an earlier attempt may have created (an own key, a certificate,
  a folder at the "old provider"), it clears away through the API at the start.
- **Wait for states, not for time.** For work in the background (Autocrypt, sync, delivery),
  `expect.poll` on the API instead of fixed pauses; `waitForTimeout` only to show that *nothing*
  happens within a time.
- **Expect the instant display.** Your own chat message appears at once
  (`data-message="pending-…"`) and briefly next to the server's; look for the server's
  (`:not([data-message^="pending-"])`) or deliberately for `.last()`.
- **Find mails without text filters.** Stalwart answers the text filters of `Email/query`
  (`text`, `from`, `to`, `subject`, `body`) from its full-text index, which it fills in the
  background; a mail that has just arrived is missing there for a while, and the check "the word
  is in no mail" would be green for the wrong reason. Tests fetch the newest mails
  (`recentMails()`, by subject `mailsWithSubject()`, folders through `mailboxWithRole()` in
  `e2e/helpers.ts`) and search themselves; `rawInboxMail()` reads what is on the server.
- **Only type once the focus is there.** After a menu, the focus comes back to the text a moment
  later; keys typed before that go nowhere (`await expect(feld).toBeFocused()`).
- **Only measure sizes once they are settled.** What only appears or grows after loading (the
  tiles of a call, a message just sent) is measured with `expect.poll`, not with a single
  `boundingBox()`.
- **The stand-in phone box only uploads once Kontext knows the call.** It reports a call and
  uploads a fax or voicemail in the same breath; if the upload came first, the result would be
  "Unbekannter Anruf" (unknown call) (`dev/fake-box.ts`, `uploadOnceKnown`).
- **Three times at night.** The nightly CI run runs every E2E test three times and without
  retries (`--repeat-each=3 --retries=0`); what fails there even once is flaky and gets fixed,
  not skipped. Locally that works with `bun run e2e --repeat-each=3`, on a branch with
  **Actions → CI → Run workflow** and "repeat".

The local instance
allows IMAP sign-ins without TLS (only on 127.0.0.1), so that mail programs and the integration
tests can connect.

## Film { #film }

The film at the top of the home page is made, like the screenshots, from the real app with the
test data, not from a screen recording, once in German and once in English
(`FILM_LANG=de` or `en`, `video/language.ts`): `bun run video` makes both one after the other,
`bun run video:de` or `video:en` only one. In the English film the browser runs on `en-GB`, the
app is in English, and titles, subtitles and typed texts come from `say("…", "…")`; Weber
Haustechnik's test data stays German. The takes find the controls through the app's own texts
(`ui("mail_inbox")` from `messages/*.json`), so that both languages go through the same steps.
Each language has its own files: `docs/assets/kontext-film.de.mp4` and `.en.mp4`, the poster
images `.jpg`, and the teasers `kontext-teaser.de.webp` (`README.de.md`) and `.en.webp`
(`README.md`); `docs/index.md` shows the German film, `docs/index.en.md` the English one. Both
refer to `assets/kontext-film.mp4` without the language: mkdocs-static-i18n publishes
`kontext-film.de.mp4` as `assets/kontext-film.mp4` and `kontext-film.en.mp4` as
`en/assets/kontext-film.mp4`; `assets/kontext-film.de.mp4` doesn't exist on the site. Two
steps per language:

1. **Record** (`bun run video:record`, the Playwright project `video`): `e2e/video.spec.ts` calls
   a take from `video/takes/` for each scene. It operates the app step by step and takes a sharp
   picture after each step (double pixels on desktop, triple on the phone), along with where the
   pointer clicks and where the camera looks (`video/take.ts`). Everything goes to
   `.dev/video/takes/<language>/<scene>/`. `TAKE=chat FILM_LANG=en bun run video:record` records
   only one scene again.
   The video call really runs over LiveKit, with drawn people as the camera
   (`video/camera.ts`); the AI scene really calls Kontext's MCP server, only the assistant's chat
   window next to it is drawn (`video/panels.ts`), as is the card with what the server stores of
   a confidential message – its content comes from the API. In the documents scene, Kontext's frame shows pictures of the real Schreibzeug (`video/schreibzeug/`, from `docs/screenshots/` of firsttris/schreibzeug), because the stand-in in the tests only says who is signed in.
2. **Render** (`bun run video:render`, `video/render.ts`): the stage (`video/stage/`) puts the
   pictures into browser windows and phones, moves pointer and camera, cross-fades and sets
   titles and subtitles. It is a page in Chromium that shows a fixed picture for any point in
   time (`window.film.render(t)`, the timing in `video/stage/timeline.ts`); it is rendered frame
   by frame, and ffmpeg turns that into an MP4 (H.264, plays everywhere), a poster image and a short cut as an animated WebP for the READMEs (`docs/assets/kontext-teaser.<language>.webp`; GitHub doesn't play video from the repository but does show animated images). Which parts go into the cut is in `teaser` in `video/storyboard.ts`. It runs at 30 frames per second like the film – with fewer, camera and pointer judder; `--teaser` cuts it again without rendering the film again. `img2webp` from libwebp makes the WebP with a keyframe every eight frames: ffmpeg's own animated WebP has only one at the start and then misses small changes, so old blocks stayed behind during slow cross-fades and camera moves. With
   `--stills 12,40.5`, single pictures are made in `.dev/video/stills/<language>/`; with `--from 20 --to 35
   --out .dev/video/teil.mp4`, an excerpt.

Order, titles and subtitles are in `video/storyboard.ts` and in the steps of the takes: short,
because most people watch the film without sound. After a change to the app's look:
Actions → _Update video_ → Run workflow (or `bun run video`, needs ffmpeg and img2webp, package
`webp`), then watch both films.

## CI and releases { #ci-und-releases }

- **CI** (`.github/workflows/ci.yml`): types, lint, unit tests, build and `bun audit` in one
  job; the E2E and integration tests in parallel in the official Playwright image, in four shards
  at once (`bun run e2e --shard=1/4` … `4/4`, each with its own Stalwart and fresh test data;
  files stay whole within one shard), with Stalwart cached. The check "End-to-end
  tests (Stalwart + Playwright)" combines the four. Draft pull requests don't build; only
  "Ready for review" starts the run. A new push cancels a pull request's old run; runs on `main`
  run to the end. Everything runs again at night, so that new security advisories show up, with
  the E2E tests three times without retries (see [Robust E2E tests](#robuste-e2e-tests)).
  If a push or pull request only changes text (Markdown files, `docs/`, `LICENSE`), CI doesn't
  run; a release after that then tests on its own before it builds.
- **Documentation** (`.github/workflows/docs.yml`): every pull request and every push to `main`
  that changes `docs/` or `mkdocs.yml` builds the pages with MkDocs Material (`--strict`); on
  `main` they are then published to GitHub Pages (once: Settings → Pages → Source "GitHub Actions"). Locally: `pip install mkdocs-material
  mkdocs-static-i18n && mkdocs serve`. German is under `/`, English under `/en/`: a page is
  translated with a file next to it (`index.en.md` for `index.md`); without one, the English
  page shows the German text. The home page is the tour in pictures, `ueberblick.md` the overview.
- **New versions of Stalwart, LiveKit & Co.** (`.github/renovate.json5`): the
  [Renovate app](https://github.com/apps/renovate) opens a pull request for every new release of
  the images in `deploy/` (Stalwart, LiveKit, LiveKit SIP, Redis, Caddy) and of the Bun base
  images in the Dockerfiles; open ones are listed in the issue "Dependency Dashboard". For
  Stalwart and LiveKit, the pull request bumps `deploy/compose.yaml`, `deploy/quadlet/` and
  `dev/config.ts` together, so that its E2E tests already run against the new release. Before
  merging a Stalwart update, read its changelog and `UPGRADING/`, and check the workarounds
  marked in the code with Stalwart's version (`git grep -n 'Stalwart [01]\.'`). A new major
  version may need a data migration at the customers (like
  [0.16 to 1.0](installation.md#stalwart-016-auf-10-heben)). Renovate doesn't touch our own
  images (`tristanteu/*`). All other packages, the actions and the images come with the shared
  settings from
  [firsttris/workflows](https://github.com/firsttris/workflows#renovate-in-every-project):
  minor and patch updates on the 1st of the month in one pull request, which Renovate merges
  itself when CI is green; majors only when they are ticked in the Dependency Dashboard; security
  updates at once. Check: `bunx --package renovate renovate-config-validator
  .github/renovate.json5`.
- **Screenshots**: Actions → _Update screenshots_ → Run workflow (or `bun run screenshots`, locally
  with `PW_CHROMIUM_PATH` if Playwright's own browser is missing).
- **Film**: Actions → _Update video_ → Run workflow (or `bun run video`, see [Film](#film)).
- **Release**: Actions → _Bump version_ → Run workflow on `main`, choosing `patch`, `minor` or
  `major` (for a release candidate `preminor`, then `prerelease`, and finally `patch`). The run
  bumps the version in `package.json`, commits it as "Release vX.Y.Z", sets the tag and starts
  _Release_ (`.github/workflows/release.yml`) on it. That is the way to make a release. The
  scripts `release:patch` (`:minor`, `:major`) in `package.json` call `npm version`, so they need
  npm, and push the commit and the tag straight to `main` – bypassing pull requests; don't use
  them.
- **What the release publishes:** it skips CI if `main` has already tested that state green, and
  builds for `linux/amd64` and `linux/arm64` the images `docker.io/tristanteu/kontext` and
  `ghcr.io/firsttris/kontext` (Docker Hub and GitHub Container Registry) as well as
  `docker.io/tristanteu/kontext-box` (Docker Hub only; GHCR holds only its build cache), each
  with the tags `X.Y.Z`, `X.Y` and `latest` (a release candidate only `X.Y.Z-rc…` and `next`).
  It also creates the GitHub release and then sets `KONTEXT_VERSION` in `deploy/.env.example`
  and the image in `deploy/quadlet/kontext.container` to the new version (commit "deploy: images
  of vX.Y.Z" on `main`). The workflows come from
  [firsttris/workflows](https://github.com/firsttris/workflows) (`docker-release.yml`,
  `bump-version.yml`).
