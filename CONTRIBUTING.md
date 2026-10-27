# Contributing to Kontext

Issues and pull requests are welcome. Kontext is a web app and a small Bun server in front of the
Stalwart mail server; how the pieces fit is in the
[architecture](https://firsttris.github.io/kontext/architecture.html), how to run it locally in
[development](https://firsttris.github.io/kontext/development.html) (both in German).

## Reporting bugs and ideas

Use the issue forms: [bug report](https://github.com/firsttris/kontext/issues/new?template=bug_report.yml)
or [feature request](https://github.com/firsttris/kontext/issues/new?template=feature_request.yml).
A good bug report names the browser or phone, the view, what happened and the Kontext version
(*Einstellungen → Darstellung → App auf diesem Gerät*); a screenshot helps. Security problems go
privately, see [SECURITY.md](SECURITY.md).

## Pull requests

- Work on a branch of your own and open a pull request into `main`; nothing is pushed to `main`
  directly.
- One feature or fix per pull request, in one or a few commits. Before pushing,
  `git fetch origin main` and rebase if needed.
- Update what the change affects in the same pull request, and only that:
  - the tests: Vitest next to the code for pure logic, Playwright in `e2e/` for what a user does,
    on the desktop and on the phone (`@phone`);
  - the docs in `docs/` that describe it;
  - both READMEs (`README.md` in English, `README.de.md` in German) when a feature a user sees is
    added, changed or removed;
  - the screenshots after a change to the look (`bun run screenshots`, or the *Update screenshots*
    workflow).
- Code, comments and commit messages in English. The app's texts are German for now and live in
  `messages/de.json`; the docs in `docs/` are German too.
- Code style: functional TypeScript – small pure functions, data in and out, side effects at the
  edges, function components and hooks, no classes; errors as values. Split a file past about 400
  lines and a function past about 80.

## Checks

Run these before every push; CI runs the same:

```sh
bun install --frozen-lockfile
bun run typecheck && bun run lint && bun run test && bun run build   # or: bun run check
bun run e2e              # own Stalwart on 28080, server on 28090, Vite on 5174, seeded fresh
mkdocs build --strict    # when docs/ or mkdocs.yml changed (pip install mkdocs-material)
```

`bun run e2e` needs Playwright's Chromium once (`bunx playwright install chromium`). The ports of
the tests are their own, so a running `bun run dev` (Stalwart 18080, server 18090, Vite 5173) is
not disturbed.

## License

Kontext is licensed under the [AGPL-3.0](LICENSE).
