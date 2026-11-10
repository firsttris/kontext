# Security policy

## Supported versions

Only the latest release of Kontext gets security fixes. Kontext and its images
(`tristanteu/kontext`, `tristanteu/kontext-box`) are released together; update to the newest
version before reporting, as described under
[Updates](https://kontext.email/installation.html#6-updates).

| Version | Supported |
| --- | --- |
| [latest release](https://github.com/firsttris/kontext/releases/latest) | yes |
| older releases | no |

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Report it privately through
GitHub's private vulnerability reporting:
[Security → Report a vulnerability](https://github.com/firsttris/kontext/security/advisories/new).

A good report names the Kontext version (*Einstellungen → Darstellung → App auf diesem Gerät*
shows the app's and the server's), how to reproduce the problem and what an attacker gains. We
confirm the report, work on a fix in a private security advisory and publish the advisory with the
release that fixes it.

Problems in Stalwart, LiveKit, Caddy or Schreibzeug belong to those projects; if Kontext's
configuration in `deploy/` makes them exploitable, report it here.

## Keeping dependencies up to date

[Renovate](https://github.com/apps/renovate) keeps the dependencies up to date
(`.github/renovate.json5`, with the shared settings of
[firsttris/workflows](https://github.com/firsttris/workflows/blob/main/renovate/default.json5)).
Every update comes as a pull request and runs through the whole CI, including `bun audit`, the
tests and the e2e suite against a real Stalwart.

- **Vulnerabilities:** Renovate learns of known vulnerabilities in the dependencies from GitHub's
  Dependabot alerts and, independently, from the [OSV database](https://osv.dev/). The fix comes
  outside the schedule as a pull request of its own with the label `security`, at the earliest one
  day after its release, and is merged by hand.
- **Other updates:** minor and patch updates come once a month together in one pull request that
  merges itself when CI is green. Major versions wait in the "Dependency Dashboard" issue until
  someone asks for them.
- **Waiting period:** Renovate takes a new release only after three days; most broken or hijacked
  releases are pulled by then.
- **Pull requests of their own, with a checklist:** Stalwart, LiveKit and Bun each get a pull
  request of their own that does not merge itself.
- **Pinned versions:** CI installs exactly the versions in `bun.lock` with
  `bun install --frozen-lockfile`.
- **Not through Renovate:** Kontext's own images move with its releases, Schreibzeug with its own.

A fix reaches an installation with the next release of Kontext; how to update is described under
[Updates](https://kontext.email/installation.html#6-updates).
