# Notes for Claude

## Documentation

The documentation is in `docs/` (<https://firsttris.github.io/kontext/>). Read the pages that
touch the change before starting: `architecture.md` for how the pieces fit, `development.md` for
the local Stalwart, the seed and the tests, `installation.md` for a customer server. Links in the
README and the docs point to the GitHub Pages site, not to `docs/*.md`.

## Reference implementations

Base details on the sources, not on memory. Clone them shallowly (`git clone --depth 1`) into the
scratchpad and name the source file in comments and commit messages where it settles a detail:
- **Stalwart** (`stalwartlabs/stalwart`, tag of `STALWART_VERSION` in `dev/config.ts`): the
  management objects (`crates/registry/src/schema/structs.rs`, used as `x:<Object>/get|set`),
  the bootstrap (`crates/store/src/registry/local.rs`, `UPGRADING/v0_16.md`), the JMAP methods
  (`crates/jmap-proto/src/request/method.rs`).
- **JMAP**: RFC 8620 (core, push), RFC 8621 (mail), draft-ietf-jmap-calendars and
  draft-ietf-jmap-contacts; JSCalendar RFC 8984, JSContact RFC 9553.
- **Mockups**: the design canvas "Mail UI Mockup" (claude.ai artifact) is the look to follow:
  zinc tokens, Geist, rail + sidebar + list + pane, compact, the phone screens with tab bar.

## With every change

Update what the change affects, in the same commit, and only that:
- the tests for what changed (Vitest next to the code for pure logic, Playwright in `e2e/` for
  what a user does, desktop and `@phone`);
- the docs in `docs/` that describe it;
- both READMEs (`README.md` in English, `README.de.md` in German) when a feature a user sees is
  added, changed or removed;
- the screenshots after a change to the look: **Actions → Update screenshots → Run workflow**
  (or `bun run screenshots`), then look at the new pictures.

## Checks

Green before every push, then check CI:

```sh
bun run typecheck && bun run lint && bun run test && bun run build
bun run e2e              # own Stalwart 28080, server 28090, Vite 5174, seeded fresh
mkdocs build --strict    # when docs/ or mkdocs.yml changed
```

## Commits

- Work on `main` directly; no pull requests for now. One feature per commit (or a few commits).
- Before pushing, `git fetch origin main` and rebase if needed.

## Working rules

- Commands as root (`sudo`, `pkexec`) are run by the user; don't work around that.
- The user's running processes are not stopped; use other ports for tests (dev: Stalwart 18080,
  server 18090, Vite 5173; e2e: 28080, 28090, 5174).
- Language: code, comments and commits in English; `README.md` in English with `README.de.md` in
  German; docs and the app in German for now (the first users are German businesses; English
  comes later; all app texts in
  `messages/de.json`, used through Paraglide's `m.*`).

## Code style

Technology choices follow `tech-stack.md` in firsttris/workflows; Bun is the runtime and package
manager (no pnpm/Node needed; Node only exists inside the Playwright image).

Clean Code, written functionally: clear names, small functions that do one thing, dependencies
passed in, no duplication or dead code, comments that say why; the ideas behind SOLID and the
design patterns are welcome as functions, data and closures, but not as classes, inheritance or
class hierarchies.

Functional, not object-oriented: pure functions that take data and return data, side effects at
the edges; function components and hooks, no classes; errors as values. A file does one thing:
split it past ~400 lines, a function past ~80. A refactor changes no behaviour.

## Project specifics

- One Stalwart (Community edition, AGPL) per customer; Kontext is the web app in front of it and
  talks only JMAP (`src/jmap/`). The Kontext server (`server/`: Bun, Hono, Better Auth, Drizzle
  on SQLite) does the sign-in against Stalwart's OAuth and passes JMAP through with the session's
  token; the browser holds only an httpOnly cookie. New server features (Gmail move, company
  admin, passkeys) go there.
- Shared mailboxes are Stalwart group accounts: every member sees the group's account in the JMAP
  session (`isPersonal: false`) and can send as its address.
- Test data: `dev/seed-data.ts` ("Weber Haustechnik"). Logins `jonas@`, `anna@`, `sandra@`,
  `max@weber-haustechnik.test`, password `kaffee-werkbank-kontext` (`dev/config.ts`). Shared
  mailboxes `info@` and `rechnung@`.
- Screen sizes: desktop from `md` (768 px) with list + pane, sidebar from `lg`; phones get one
  screen at a time, chosen by the URL, and the tab bar.
