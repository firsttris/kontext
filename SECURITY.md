# Security policy

## Supported versions

Only the latest release of Kontext gets security fixes. Kontext and its images
(`tristanteu/kontext`, `tristanteu/kontext-box`) are released together; update to the newest
version before reporting, as described under
[Updates](https://firsttris.github.io/kontext/installation.html#6-updates).

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
