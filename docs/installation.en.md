---
description: >-
  Installing Kontext on your own server: DNS, Docker Compose or Podman Quadlet, setting up
  Stalwart, company admin, calls, the phone box, documents, backups with Restic and restoring,
  updates, all settings and troubleshooting.
---

# Installation { #installation }

One server per customer. It needs Docker (or Podman), a fixed IPv4 address and a domain.
For ten users a small VPS is enough (2 vCPU, 4 GB RAM, 80 GB SSD).
Secure a new VPS first: [Setting up a VPS – first steps](vps.md).

## 1. Server and DNS { #1-server-und-dns }

Check beforehand: the provider must not block port 25, and you must be able to set the reverse DNS
record (PTR) of the IP.

| Record  | Name                             | Value                                                               |
| ------- | -------------------------------- | ------------------------------------------------------------------- |
| A       | `mail.firma.de`                  | IP of the server                                                    |
| A       | `kontext.firma.de`             | IP of the server                                                    |
| A       | `dokumente.firma.de`             | IP of the server (only with [Documents](#dokumente))                |
| A       | `mta-sts.firma.de`               | IP of the server (MTA-STS, see below)                               |
| A       | `openpgpkey.firma.de`            | IP of the server (OpenPGP keys via WKD)                             |
| MX      | `firma.de`                       | `10 mail.firma.de`                                                  |
| TXT     | `firma.de`                       | `v=spf1 mx -all`                                                    |
| TXT     | `<selector>._domainkey.firma.de` | DKIM key from Stalwart                                              |
| TXT     | `_dmarc.firma.de`                | `v=DMARC1; p=none; rua=mailto:dmarc@firma.de` (later `quarantine`)  |
| PTR     | IP of the server                 | `mail.firma.de` (set at the provider)                               |

On top of that, for encryption in transit ([concept](encryption.md)): **MTA-STS** and **TLS-RPT**
require other mail servers to deliver to `firma.de` only encrypted, and report problems. Stalwart
shows the matching records under *Domains → firma.de → DNS records*
(`_mta-sts.firma.de`, `mta-sts.firma.de`, `_smtp._tls.firma.de`) and writes the policy;
Caddy serves it at `https://mta-sts.firma.de` (this needs `MAIL_DOMAIN=firma.de` in
`deploy/.env`). With DNSSEC at the provider, **DANE** comes on top (a
TLSA record, also from Stalwart). The company admin checks which of these are set.

!!! warning "Cloudflare"
    If the DNS is at Cloudflare, all records for mail and Kontext must be **"DNS only"**
    (grey cloud). No mail and no JMAP push gets through the Cloudflare proxy.

## 2. Starting { #2-starten }

```bash
# The configuration (compose.yaml, .env.example, Caddyfile, backups); the programs come from Docker Hub
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env            # only root may read the secrets
nano deploy/.env                 # domain, mail server name, secret, backup target
docker compose -f deploy/compose.yaml up -d   # pulls the images from Docker Hub and starts them
```

For `KONTEXT_SECRET`, use a long random string (`openssl rand -base64 48`); it signs the
sessions and encrypts the Stalwart tokens. Replace all `change-me` placeholders: Kontext does not
start with them, and `backup.sh` does not back up. Leave `STALWART_ADMIN_KEY` empty for now; it is
added in step 3 ([Turning on the company admin](#firmenverwaltung-einschalten)).
All settings are listed under [Settings at a glance](#einstellungen-im-uberblick). For calls in the chat, also
set `LIVEKIT_SECRET` and open **TCP 7881 and UDP 7882** in the firewall (see
[Calls](#anrufe)). Caddy gets the certificate for
`KONTEXT_DOMAIN` by itself. With Podman, the Quadlet files are in
`deploy/quadlet/` (copy them to `/etc/containers/systemd/`, `systemctl daemon-reload`); the domain
and addresses are written in each file itself, and each service gets only its own
settings (`kontext.env`, `livekit.env` … with `chmod 600`), none gets `deploy/.env`.

## 3. Setting up Stalwart { #3-stalwart-einrichten }

Stalwart's own admin interface listens only on the server itself (`127.0.0.1:8080`), never on the
internet. From your own computer, open an SSH tunnel, then `http://localhost:8080` in the browser:

```bash
ssh -L 8080:127.0.0.1:8080 root@<server>
```

If you use Tailscale, enter the server's Tailscale address instead (`TAILSCALE_IP` in
`deploy/.env`, with Quadlet in `stalwart.container`) and reach it at
`http://<tailscale-ip>:8080`. On the first start, a temporary admin password is in the log
(`docker compose -f deploy/compose.yaml logs stalwart`, with Podman `podman logs stalwart`); after
every restart before the setup there is a new one.

1. Create the **domain** `firma.de`, generate a DKIM key and add it to the DNS as a TXT record.
2. **TLS** for `mail.firma.de` via ACME, most simply with DNS-01 (Cloudflare API token), because
   port 443 belongs to Caddy. Careful: with DNS management, Stalwart itself publishes the
   records that are ticked under *Publish DNS records* – after the initial setup with a
   token, that includes **MX, SPF and DMARC `p=reject`**. If the domain's mail still runs elsewhere,
   it is switched over at once. Until the migration, tick only *DKIM*
   ([without the interface](vps.md#10-stalwart-ohne-oberflache-einrichten)).
3. Create **port 587** (submission with STARTTLS) under *Network → Listeners*: Stalwart's
   default only has 465, and many mail programs use 587.
4. **Run the [setup command](#einrichtungsbefehl)** – required, not optional: it registers
   Kontext as the OAuth client (step 12), allows directory queries (step 13) and creates the role,
   account and API key for the [company admin](#firmenverwaltung-einschalten); enter the key as
   `STALWART_ADMIN_KEY`, then create the boss's account. The boss then creates further employees
   and shared mailboxes in Kontext themselves.
5. Under *Settings → Network → HTTP → General*, section *Proxy*, choose *X-Forwarded-For header*
   as the **Client IP source** (`clientIpSource: xForwardedFor`) and leave *Trusted proxy hops*
   at 1 (`forwardedHops`), so that Stalwart sees the real IP addresses for CalDAV/CardDAV and
   autoconfig (through Caddy). Stalwart takes the last entry, which Caddy sets.
6. Under *Security → Allowed IPs*, enter the container network **`10.89.250.0/24`**
   (`AllowedIp`). Kontext signs in everyone from its one address; without this entry
   Stalwart blocks that address after 100 failed attempts a day (`authBanRate`) – and with it
   Kontext for everyone. Against password guessing, Kontext slows things down itself: 10 failed
   attempts per sign-in name in 15 minutes, plus 10 sign-ins per IP address per minute.
7. Under *Security*, set a **ban duration** (`authBanPeriod`, `scanBanPeriod`, e.g. one
   day). Without a duration, a ban lasts forever.
8. Under *Search*, set the **default language** to German (`de-DE`). Stalwart then builds
   German word stems, even for short mails whose language it cannot reliably detect.
9. Under *JMAP*, set the **concurrent requests** (`maxConcurrentRequests`) to 16.
   Otherwise Stalwart allows 4 per person – for all tabs and devices together; Kontext asks for
   more at once on start (the folders of each mailbox, the list, the conversations), and Stalwart
   rejects whatever goes beyond that. Kontext retries a request rejected this way a few times after
   a short pause (`src/jmap/client.ts`); only then does it show an error.
10. In the calendar settings (`x:CalendarScheduling`), **turn off HTTP RSVP**
    (`httpRsvpEnable: false`), but leave scheduling itself (`enable`) on. Kontext sends
    invitations with its own buttons; Stalwart's buttons would point to an address where
    Caddy answers (see [Invitations](architecture.md#einladungen)). The buttons in Kontext's
    invitations need the company admin (the key below).
11. In the SMTP authentication settings (`x:MtaStageAuth`, `saslMechanisms`), delete the second
    rule, which offers `oauthbearer` and `xoauth2` on 587 **without TLS**, so that only
    `local_port != 25 && is_tls` → `[plain, login, oauthbearer, xoauth2]` remains. Otherwise a
    token would travel in plain text if someone strips STARTTLS from the connection. Kontext
    itself sends through JMAP, not through SMTP.
12. **Kontext as an OAuth client** – required, otherwise nobody can sign in; the
    [setup command](#einrichtungsbefehl) does this. By hand: under *Management → Directory → OAuth
    Clients*, create a client with the *Client ID* `kontext`, the *Redirect URI*
    `https://kontext.invalid/oauth` (never called) and the scope **Full** (`full`), without a
    secret. Stalwart 1.0 only accepts clients it knows, and gives a token only the scopes the
    client allows; `full` gives Kontext's token all the rights of the account that the settings and
    the company admin need (see [Sign-in](architecture.md#anmeldung)). Only a superuser may set
    the scope `full`. If the client is missing, Kontext writes `Stalwart
    lehnt die Anmeldung für Kontext ab (Unknown client id)` ("Stalwart rejects the sign-in for
    Kontext") to the log when someone signs in; if the scope is missing, `… ab
    (invalid_scope)`.
13. **Allow directory queries** – the setup command does this too; by hand under
    *Settings → Sharing* (`x:Sharing`, `allowDirectoryQueries: true`), then reload the settings
    (*Reload*). Required: without it Kontext finds no colleagues (sharing, new chat, free times when inviting); Stalwart 1.0
    otherwise rejects `Principal/query` (`The administrator has disabled directory queries`).

### The setup command { #einrichtungsbefehl }

What Kontext needs in Stalwart is set up by one command in the Kontext container. It asks for
Stalwart's admin login (the name, e.g. `admin@firma.de`, and the password, which is not shown);
the login stays in memory only, none of it is written or printed:

```bash
docker compose -f deploy/compose.yaml exec kontext bun server/setup-stalwart.ts
podman exec -it kontext bun server/setup-stalwart.ts      # with Quadlet
```

It makes sure that

- the **OAuth client** `kontext` with the redirect URI `https://kontext.invalid/oauth` and the
  scope `full` exists (step 12); an older client without `full` gets the scope added;
- **directory queries** are allowed, and then reloads the settings (step 13);
- the **role** `Kontext-Server` with exactly the permissions from [Turning on the company
  admin](#firmenverwaltung-einschalten) exists (it inherits *User*), plus the **account**
  `kontext-server@firma.de` with this role and a random password, and an **API key** for this
  account.

It prints the new key once, as the line `STALWART_ADMIN_KEY=API_…`: put it into `deploy/.env`
(with Quadlet into `deploy/kontext.env`) and restart Kontext
(`docker compose -f deploy/compose.yaml up -d`, with Quadlet `systemctl restart kontext`).

The command only changes what is missing: if the client, role, account or key already exist, it
says so and at most adds missing permissions or the scope; it never creates a second key. That
is why it belongs to every update ([Updates](#6-updates)). If the key is lost, delete it in
Stalwart on the account `kontext-server@` and run the command again. If Stalwart has several
domains, `--domain firma.de` picks the one for the account the first time; after that it keeps to
the account's domain. Without a terminal (in a script, say)
it takes the login from the environment variable `STALWART_ADMIN` (`name:password`). What exactly
it does is in `server/stalwart-setup.ts`.

Then sign in at `https://kontext.firma.de`. On the phone, choose "Add to Home Screen" in the
browser: Kontext then starts like an app and stays signed in.

### Calls { #anrufe }

Calls and meetings in the chat run over LiveKit, which `compose.yaml` starts with the profile `calls`
(`COMPOSE_PROFILES=calls` in `.env`; `.env.example` has `calls,documents`). This needs:

- `LIVEKIT_SECRET` in `.env`: at least 32 characters (`openssl rand -base64 48`). Kontext and
  LiveKit use the same one.
- **TCP 7881** and **UDP 7882** open in the server's firewall (and at the provider). Sound and
  picture go through them; joining the call runs through Caddy (`https://kontext.firma.de/rtc`).
- LiveKit finds the server's public IP by itself (STUN). If the server sits behind NAT, enter
  `node_ip: <public IP>` under `rtc` in `deploy/livekit.yaml` and set
  `use_external_ip: false`.

With Podman: copy `deploy/quadlet/livekit.container` as well, put `LIVEKIT_KEYS="kontext: <secret>"` in
`/opt/kontext/deploy/livekit.env` and the same secret as `LIVEKIT_API_SECRET` in
`kontext.env`. Without a secret, calls stay off and everything else runs as before.

For ten people the small VPS is enough; a video call with three people needs about
3–5 Mbit/s per participant in each direction at the server.

### Telephony { #telefonie }

For the company number to ring in Kontext as well and for calling out of Kontext, you need
LiveKit SIP and Redis on the server (already part of the profile `calls`) and a phone box in the office.

**On the server:** additionally open **TCP 5060** (SIP from the boxes) and
**UDP 20000–20100** (voice) in the firewall. Kontext registers the boxes with LiveKit SIP itself;
Settings → Telephony shows whether that worked. The telephony settings belong to the
company admin and therefore also need `STALWART_ADMIN_KEY`.

With Podman, `redis.container` and `livekit-sip.container` go to `/etc/containers/systemd/`
alongside `livekit.container` (see [Calls](#anrufe)), plus `/opt/kontext/deploy/livekit-sip.env`
with `SIP_CONFIG_BODY` on one line and the LiveKit secret as `api_secret`. The commands
for this are in [Setting up a VPS, step 9](vps.md#9-kontext-mit-quadlet-starten); afterwards
`systemctl daemon-reload` and `systemctl start redis livekit livekit-sip`.

**In the Fritzbox:** Telefonie → Telefoniegeräte → Neues Gerät einrichten → „Telefon (mit und
ohne Anrufbeantworter)“ → „LAN/WLAN (IP-Telefon)“ (Telephony → Telephony Devices → Configure New
Device → Telephone (with and without answering machine) → LAN/WLAN (IP telephone)), name "Kontext".
Note the user name and password, and set which numbers the device responds to and which one it
calls with. For direct extensions, create another device of this kind per number that only
responds to that number and calls with it, and enter it in Kontext under "Other numbers".

**In Kontext:** Settings → Telephony: enter the Fritzbox's IP as its address (usually
`192.168.178.1`), the user name and password from the Fritzbox, choose who should ring,
then "Pair box". A name like `fritz.box` works too: the box resolves it to IPv4 itself,
because it also points to the Fritzbox's IPv6 address, and Asterisk only speaks IPv4. The
page shows by itself as soon as the box is connected and registered with the Fritzbox.

**The box:** a device on the office network that is always on – a used thin client (Futro S740,
Wyse 5070), a Raspberry Pi with an SSD, the company server or a NAS with Docker. Ideally on a cable.
Only one file goes onto the device, `deploy/box.compose.yaml` – downloaded (with the version in
the path matching the Kontext server) or with the whole repository (`git clone`, then
`-f deploy/box.compose.yaml`):

```bash
mkdir -p /opt/kontext-box && cd /opt/kontext-box
curl -fsSLO https://raw.githubusercontent.com/firsttris/kontext/v0.1.6/deploy/box.compose.yaml
echo KONTEXT_VERSION=0.1.6 > .env      # the same version as the server; without this line: latest
KONTEXT_URL=https://kontext.firma.de PAIRING_CODE=K7QM-4XPA \
  docker compose -f box.compose.yaml up -d
```

The code is shown in Kontext under Settings → Telephony → "Pair box" and is only needed on the
first start. `box.compose.yaml` takes the image `tristanteu/kontext-box` in the version
from `KONTEXT_VERSION` (Compose reads the `.env` in the file's folder), otherwise `latest`. For an
update, raise the version there, then `docker compose -f box.compose.yaml pull` and
`docker compose -f box.compose.yaml up -d`; the box does not update itself.

The box needs a **fixed address on the LAN** (in the Fritzbox under Heimnetz → Netzwerk →
Gerät → „Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen“, i.e. Home Network →
Network → device → "Always assign this network device the same IPv4 address"). It needs no open
ports to the outside, only outgoing access to Kontext (HTTPS, 443) and to the Kontext server on
TCP 5060 and UDP 20000–20100. If a firewall runs on the device, allow 5070 TCP+UDP, 10000–10200 UDP
and 8089 TCP from the LAN. SIP on 5070 only listens after pairing; before that there is only the
status page.

**Desk phones (Snom):** create them in Kontext under Telephony → Desk phones with their MAC address,
then in the phone (web interface → Advanced → Update) enter
`http://<box>:8089/snom/{mac}.xml` as the settings URL and restart it; it fetches its account and
settings from the box. For this the box needs a fixed address on the LAN. It hands out the password
only on the first request; after a reset of the phone, delete the desk phone in Kontext and
create it again.

With Podman: copy `deploy/quadlet/kontext-box.container` to `/etc/containers/systemd/`
(it can also be downloaded on its own as above), `systemctl daemon-reload`, `systemctl start kontext-box`;
after a reboot the box starts by itself. The file names `Image=…/kontext-box:latest`; better
enter the server's version there (`kontext-box:0.1.6`). For an update, raise the version,
`systemctl daemon-reload`, `podman pull docker.io/tristanteu/kontext-box:<version>` and
`systemctl restart kontext-box` – with `latest`, a restart does not fetch a new image. Started without a code, the box shows a form for Kontext's
address and the code at `http://<box>:8089`; with a code, `KONTEXT_URL` and `PAIRING_CODE` are in `/etc/kontext-box.env`.
It runs in the host network (SIP with the Fritzbox on 5070, voice on 10000–10200 on the LAN).

Building the box yourself (say, for a version that is not on Docker Hub yet), from v0.1.4 on –
the box up to v0.1.3 does not load its configuration from Kontext and never registers with the Fritzbox:

```bash
git clone --depth 1 --branch v0.1.4 https://github.com/firsttris/kontext.git /opt/kontext-box-src
cd /opt/kontext-box-src
podman build -f box/Dockerfile -t kontext-box:0.1.4 .
```

In the Quadlet file it is then `Image=localhost/kontext-box:0.1.4` (Podman puts `localhost/` in
front of locally built images); with Docker it is `kontext-box:0.1.4`, and `docker build` instead of `podman build`.

Checking: `curl http://127.0.0.1:8089/` shows "Kontext-Telefonbox", and
`podman exec kontext-box asterisk -rx "module show like res_pjsip.so"` shows `res_pjsip.so`.
The message "There are no local system nameservers configured, resorting to system resolution"
on start is harmless: Asterisk on Alpine does not read the nameservers itself and then uses
the system's.

**If the box does not register with the Fritzbox** (with Docker, `docker` instead of `podman`):

- `podman exec kontext-box asterisk -rx "pjsip show registrations"` shows the registration.
  "No objects found": Asterisk has not loaded the configuration – the status page then shows the
  reason next to "Konfiguration" (configuration). `Registered`: all good.
- "Rejected" with "No response received" in the log (`podman logs kontext-box`): the Fritzbox never
  answered. Enter the Fritzbox's IP as its address; `ping 192.168.178.1` checks whether it can be
  reached.
- "Rejected" with `403 Forbidden`: the user name or password does not match the IP phone in the
  Fritzbox (the box then only tries again after 5 minutes).
- `ss -lunp | grep 5070` shows whether the box listens on 5070; a firewall on the device must let
  5070 and 10000–10200 through from the LAN.

### Documents { #dokumente }

The "Documents" module is [Schreibzeug](https://github.com/firsttris/schreibzeug), a separate
service with its own data and versions. `compose.yaml` starts it with the profile `documents`
(`COMPOSE_PROFILES=calls,documents` in `.env`, as in `.env.example`). This needs:

- an address of its own under the same domain, such as `dokumente.firma.de` (an A record like Kontext's),
  as `SCHREIBZEUG_URL=https://dokumente.firma.de` in `.env`. Caddy gets the certificate for it
  by itself. The same domain keeps the frame and the sign-in free of detours (no third-party cookies).
- `SCHREIBZEUG_CLIENT_SECRET` in `.env`: at least 32 characters (`openssl rand -base64 48`). With it,
  Schreibzeug signs in to Kontext; Kontext registers Schreibzeug as a trusted client on start,
  without a consent page.

Whoever is signed in to Kontext is then signed in to Documents too; attachments can be filed there and
documents attached to mails. Every shared mailbox gets a folder of its own there for its
people; for this, Kontext reads the members with `STALWART_ADMIN_KEY`, as for the company admin. Without `SCHREIBZEUG_URL` the module is missing, and everything else runs as before.
Schreibzeug also runs on its own at its address, with "Sign in with Kontext".

With Podman: copy `deploy/quadlet/schreibzeug.container` as well, enter `SCHREIBZEUG_URL`,
`SCHREIBZEUG_EMBED_ORIGIN=https://kontext.firma.de`,
`OIDC_ISSUER=https://kontext.firma.de/api/auth` and `OIDC_CLIENT_SECRET` (the same secret) in
`/opt/kontext/deploy/schreibzeug.env`, and `SCHREIBZEUG_URL` and `SCHREIBZEUG_CLIENT_SECRET` in `kontext.env` too.

**Without Documents:** with Compose, take `documents` out of `COMPOSE_PROFILES` and delete the two lines
`SCHREIBZEUG_URL` and `SCHREIBZEUG_CLIENT_SECRET` from `.env`; leaving them empty would also work, because
`compose.yaml` then gives Caddy a placeholder (`https://schreibzeug.internal`) that answers
nobody. With Quadlet, do not copy `schreibzeug.container`, leave the two lines out of `kontext.env`
and delete the line `Environment=SCHREIBZEUG_URL=…` in `caddy.container`: Caddy reads
the address there, not from `kontext.env`, and would otherwise keep getting a certificate for it.

The server stays lean: editing and text recognition run in the browser.

### Location suggestions { #ortsvorschlage }

In the "Location" field of an appointment, Kontext suggests addresses. For this, the Kontext server asks
[Photon](https://github.com/komoot/photon) (komoot, data from OpenStreetMap) at
`https://photon.komoot.io/api/` – this is on without any setting. What someone types as a location thus goes
from the server to komoot (not the browser's address). With `PLACES_URL=` (empty) in `.env` or
`kontext.env` the suggestions are off, and the field still takes any text. You enter your own Photon
(say, with the data for Germany only) as `PLACES_URL=https://photon.firma.de/api/`.
komoot's public service is meant for moderate use; Kontext only asks after a
pause in typing and from three letters on.

### Turning on the company admin { #firmenverwaltung-einschalten }

Under *Settings → Company*, the boss (or the office manager) creates employees and shared
mailboxes, resets passwords and the sign-in with a code, and locks accounts. For this,
the Kontext server needs an API key from Stalwart that may only manage accounts
(`STALWART_ADMIN_KEY`).

!!! warning "Without the key, a lot is missing"
    Kontext starts without `STALWART_ADMIN_KEY` too, but then these are missing:

    - the **company admin** entirely – employees, shared mailboxes, company signature,
      backup, telephony settings and the [migration](#umzug);
    - **Other mailboxes** (Gmail, GMX …): the entry is missing from the settings, because the
      server puts the fetched mails into the mailbox with the key;
    - the **reply buttons** in invitations: Kontext sends them without Yes / No / Maybe,
      because the reply is entered with the key
      ([Invitations](architecture.md#einladungen));
    - in [Documents](#dokumente), the **folders per shared mailbox**: Kontext reads the
      members with the key.

    That is why it is part of the setup (step 4 under [Setting up Stalwart](#3-stalwart-einrichten)).

The [setup command](#einrichtungsbefehl) creates the role, account and key (steps 1–3); by hand
in Stalwart's admin interface it goes like this:

1. Create a **role** `Kontext-Server`: it inherits the role *User*
   and additionally gets the permissions `sysAccountGet`, `sysAccountQuery`, `sysAccountCreate`,
   `sysAccountUpdate`, `sysRoleGet`, `sysRoleCreate`, `sysDomainGet`, `sysAuthenticationGet`,
   `sysIndexQueueStatusGet` and `impersonate`. With `sysIndexQueueStatusGet` the
   company admin shows while Stalwart is building the search index. With `impersonate` the server works in the employees' mailboxes
   (out of office, read access to shared mailboxes) and enters replies to invitations;
   the app never shows the boss anyone else's mail in doing so.
2. Create an **account** `kontext-server@firma.de` with this role (instead of *User*) and a long
   random password.
3. With this account, generate an **API key** (*Credentials → API Key*, permissions
   *Inherit*). It starts with `API_`; enter it in `deploy/.env` as `STALWART_ADMIN_KEY` and
   restart Kontext (`docker compose -f deploy/compose.yaml up -d`); with Quadlet in
   `deploy/kontext.env`, then `systemctl restart kontext`. Without the interface, the same works through
   Stalwart's API ([Setting up a VPS, step 10](vps.md#10-stalwart-ohne-oberflache-einrichten)).
4. On the first call, Kontext creates the role `Firmenverwaltung (Kontext)` (company admin). Give the
   boss's account in Stalwart this role **in addition to User**. After that, they can pass it on
   to other people in Kontext themselves.

Stalwart does not let the key grant permissions it does not have itself; so an employee never
becomes an admin through it. Kontext only shows and changes accounts with the normal role *User*.
But the key can read all mailboxes and change the password of Stalwart's admin accounts (Stalwart
does not check the permissions of the target account here) – so treat the key like an admin
password.

### Migration { #umzug }

Under *Settings → Company → Migration*, the boss brings over the employees' data:

- **Connect mailbox** for Gmail, GMX, WEB.DE, Telekom, IONOS, STRATO or another
  IMAP server. Gmail needs an app password (turn on 2-Step Verification in the Google account,
  then *App passwords*), GMX and WEB.DE need IMAP access turned on. The
  sync runs every 15 minutes until the migration is finished; after that, set up forwarding at the
  old provider or switch the MX record of your own domain. For this, the server needs
  outgoing port 993.
- **Microsoft 365**: once per customer, in the
  [Microsoft Entra admin center](https://entra.microsoft.com) under *App registrations*, create an app
  "Kontext Umzug", under *API permissions* add the **application permissions**
  `Mail.Read`, `Contacts.Read`, `Calendars.Read` and `User.Read.All` for Microsoft Graph
  (optionally `MailboxSettings.Read`, so that Outlook categories keep their colours)
  and grant admin consent, and under *Certificates & secrets* create a
  client secret. Enter the directory ID, application ID and secret on the first
  "Connect mailbox → Microsoft 365". The app can read all mailboxes of the tenant;
  after the migration, delete the secret or remove the app.
- **Upload file**: Outlook data file (`.pst`), contacts (`.vcf`) and calendars (`.ics`), for example
  from the Google export (*Google Contacts → Export → vCard*, *Google Calendar → Settings →
  Export*). The file stays in the data volume until the end of the migration and is then unpacked: for
  a 10 GB PST, have a good 20 GB free for a while.

A large migration takes several hours, with Gmail several days because of its daily limit, and with
Microsoft 365 Graph slows down with many requests; the
progress is shown on the same page, even after a restart.

### If someone loses their phone with the authenticator app { #wenn-jemand-sein-handy-mit-der-authenticator-app-verliert }

Employees turn on the sign-in with a code themselves under *Settings → Password and security*.
If the phone is lost, the boss resets it for that employee under *Settings → Company → Employees*;
after that the employee signs in with just the password again and sets up the
code anew.

### AI agents { #ki-agenten }

Agents like Claude connect over MCP to `https://<KONTEXT_DOMAIN>/mcp`; there is nothing
to set up. Each person connects their agent themselves under *Settings → AI agents* (key)
or adds the address in Claude as a connector and signs in in the browser (OAuth). For this:

- Caddy hands `/mcp` and the OAuth discovery (`/.well-known/oauth-protected-resource`,
  `/.well-known/oauth-authorization-server`) to Kontext, and the other `/.well-known` paths on
  to Stalwart (`deploy/Caddyfile`).
- The Kontext server must be allowed out to the internet (HTTPS): Claude and other clients sign in with
  an address where their description lives (Client ID Metadata Document), and Kontext
  fetches it from there – public addresses only, without redirects.
- Whoever no longer wants an agent disconnects it in the settings; locking an
  employee disconnects all their agents.

## 4. Encrypting the disk { #4-platte-verschlusseln }

Mails, chat, tasks and files are on the server's disk. Encrypted, it is
useless to someone who takes the server or a disk away: when setting up, encrypt the data disk
with LUKS (many VPS providers offer this as an option when creating the server, otherwise a second
disk with `cryptsetup luksFormat` and the Docker volumes on it). Do not keep the key on the
server; enter it on reboot or unlock over the network (Clevis/Tang).

## 5. Backups { #5-backups }

`deploy/backup.sh` backs up with [Restic](https://restic.net) to S3 storage, most simply
Cloudflare R2 (S3-compatible, 10 GB free) – Restic
encrypts every backup with the password from `deploy/.env`, so the storage provider only sees
encrypted data; keep the password in a safe place outside the server as well. What is backed up: Stalwart's
data volume (mails, calendars, contacts, accounts), a copy of the Kontext database
(sign-ins, company signature, tasks, chat, call list, state of the migrations), the photos and files from the
chat, announcements, voicemail messages, faxes and recordings from telephony, and the confidentially sent
mails, and with Documents also Schreibzeug's database (a copy) and files. Uploaded PST files are left out. Ideally use a bucket with **Object Lock**; then even an attacker with
access to the server cannot delete the backups. This does not replace a GoBD archive for mails. Set the retention period
in the bucket to 14 days at most: `backup.sh` keeps 14 days, 8 weeks and 12 months and clears away the
rest; files locked for longer cannot be deleted. The script reports that, but checks the
backup anyway.

The target is **not on the server itself**: if the server fails or is taken over, a
backup next to it would be gone too, and it would fill the disk on which Stalwart accepts mail. Suitable:

| Target | `RESTIC_REPOSITORY` | Cost |
| --- | --- | --- |
| Cloudflare R2 (S3) | `s3:https://<konto-id>.r2.cloudflarestorage.com/kontext-firma` | 10 GB free, then about 1.5 cents per GB per month |
| Backblaze B2 (S3) | `s3:https://s3.eu-central-003.backblazeb2.com/kontext-firma` | 10 GB free |
| other S3 storage | `s3:https://…/kontext-firma` | depends on the provider |
| NAS or storage box over SFTP | `sftp:backup@nas.firma.de:/kontext` | your own hardware or Storage Box |

Restic compresses and stores identical data only once; the first backup is as large as the
data, each further one only as large as what is new. For S3, set `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY` (for R2, an API token with *Object Read & Write* for that one bucket); over
SFTP, root signs in with an SSH key (`ssh-keygen`, put the public part on the target,
`ssh backup@nas.firma.de` once to confirm the host key).

With R2, create the bucket with the location **EU**; the endpoint is then
`https://<konto-id>.eu.r2.cloudflarestorage.com` (the one without `.eu` does not find EU buckets). An
IP filter on the token needs the server's IPv4 address **and** its IPv6 network: Restic
prefers IPv6, otherwise R2 answers with *Access Denied*.

After every backup, `backup.sh` measures the size and from 8 GB on writes a warning to the log
(`BACKUP_WARN_GB` in the settings changes the limit) – before the free 10 GB run out. With R2,
also set up a mail from about 8 GB under *Notifications → Usage Based Billing*; it arrives
even when the server stays silent.

Restic must be installed on the server (`apt-get install restic`).

Every night, systemd units start the backup (templates in `deploy/systemd/`). With them,
the company admin shows the last run and the storage used under *Backup*, sets the
time and backs up at the push of a button. Kontext gets no access to the server for this: it
only leaves requests in its volume, which the units pick up
([Architecture](architecture.md#firmenverwaltung)).

```bash
cd /opt/kontext/deploy
./backup-control.sh install     # units to /etc/systemd/system, volume path filled in
systemctl enable --now kontext-backup.timer kontext-backup-control.path
crontab -l | grep -v 'deploy/backup.sh' | crontab -   # old cron entry, if there is one
systemctl start kontext-backup.service                # first backup, log: journalctl -u kontext-backup
```

The units:

| Unit | Job |
| --- | --- |
| `kontext-backup.service` | calls `backup.sh` (which locks with `flock`: never two runs at once, not even by hand or via cron), output to the journal and to Kontext, status at the start and at the end |
| `kontext-backup.timer` | every night at 03:00 (Europe/Berlin), catches up on a missed night (`Persistent=true`) |
| `kontext-backup-control.path` | watches the time and "Back up now" from Kontext and starts `kontext-backup-control.service` |

`install` finds the volume `kontext-data` (Quadlet) or `kontext_kontext-data` (Compose) through
`podman volume inspect` or `docker volume inspect`. The time from Kontext ends up in
`/etc/systemd/system/kontext-backup.timer.d/time.conf`; if it is moved forward to a time that has
already passed today, the timer backs up once right away (`Persistent=true`). After a `git pull`
with changed units, run `./backup-control.sh install` again.

Without the units, cron still works; the company admin then shows "Control isn’t set up on the
server":

```bash
crontab -e
0 3 * * *  /opt/kontext/deploy/backup.sh >> /var/log/kontext-backup.log 2>&1
```

With Podman (Quadlet) there is no `deploy/.env`; the script recognizes this by
`/etc/containers/systemd/kontext.container` and reads its settings from
`deploy/backup.env` (`chmod 600`):

```
KONTEXT_DOMAIN=kontext.firma.de
RESTIC_REPOSITORY=s3:https://s3.eu-central-1.example.com/kontext-firma
RESTIC_PASSWORD=…
AWS_ACCESS_KEY_ID=…
AWS_SECRET_ACCESS_KEY=…
```

The mail server pauses for a few seconds for this; sending servers simply try
again. The Kontext database is copied while running (`VACUUM INTO`). Once a month,
practise a restore on a test server, as described below.

### Restoring { #wiederherstellen }

Restic creates three backups per run, recognizable by their tag: `stalwart` (Stalwart's data volume),
`kontext` (the copy of the database under `backup/kontext.db` and the folders `chat-files`,
`photos`, `phone`, `secure`) and, with Documents, `schreibzeug` (`backup/schreibzeug.db`, `blobs`,
`auth-secret`). The volumes are backed up under their path on the server, for example
`/var/lib/docker/volumes/kontext_stalwart-data/_data` (Compose with Docker) or
`/var/lib/containers/storage/volumes/stalwart-data/_data` (Quadlet). With
Compose the volumes are called `kontext_stalwart-data`, `kontext_kontext-data`, `kontext_schreibzeug-data`, with Quadlet
without the prefix `stalwart-data`, `kontext-data`, `schreibzeug-data`.

Not in the backup: the settings (`deploy/.env` or the Quadlet files and
`kontext.env` … – which is why they belong in the password manager, see
[Saving the credentials](vps.md#13-zugangsdaten-sichern)) and Stalwart's volume `stalwart-config`.
It only holds `config.json` with the storage location; everything else (domains, accounts, DKIM keys,
settings) is in Stalwart's database and comes back with `stalwart`.

**1. Provide a server.** On a new server, install and start Kontext as in steps 1 and 2 with
the same settings, then go through Stalwart's initial setup
(user `admin`, password from the log), with the default storage (RocksDB under
`/var/lib/stalwart/`) – only then does `config.json` exist. Whatever you enter there is replaced
by the backup in a moment. On the old server, this step is not needed.

**2. Give Restic the settings** – the same ones `backup.sh` backs up with, as root:

```bash
apt-get install -y restic
cd /opt/kontext/deploy
set -a; . ./.env; set +a          # with Quadlet: . ./backup.env
restic snapshots                  # all backups with tag, time and path
```

**3. Stop the services**, so that nothing writes to the volumes:

```bash
docker compose -f compose.yaml stop                      # Compose
systemctl stop caddy schreibzeug kontext stalwart        # Quadlet
```

**4. Restore** into an empty folder, then into the volumes. `vol` gives the path of a
volume; with Podman Compose, `podman` instead of `docker`:

```bash
vol() { docker volume inspect -f '{{ .Mountpoint }}' "kontext_$1"; }   # Compose
vol() { podman volume inspect -f '{{ .Mountpoint }}' "$1"; }           # Quadlet

restic restore latest --tag stalwart --target /tmp/restore
restic restore latest --tag kontext --target /tmp/restore
restic restore latest --tag schreibzeug --target /tmp/restore   # only with Documents

S=$(vol stalwart-data)
find "$S" -mindepth 1 -delete && cp -a "/tmp/restore$S/." "$S/"

K=$(vol kontext-data)
rm -f "$K/kontext.db" "$K/kontext.db-wal" "$K/kontext.db-shm"
cp -a "/tmp/restore$K/backup/kontext.db" "$K/kontext.db"
for d in chat-files photos phone secure; do rm -rf "${K:?}/$d"; cp -a "/tmp/restore$K/$d" "$K/"; done

D=$(vol schreibzeug-data)                                        # only with Documents
rm -f "$D/schreibzeug.db" "$D/schreibzeug.db-wal" "$D/schreibzeug.db-shm"
cp -a "/tmp/restore$D/backup/schreibzeug.db" "$D/schreibzeug.db"
rm -rf "${D:?}/blobs" "$D/auth-secret"
cp -a "/tmp/restore$D/blobs" "/tmp/restore$D/auth-secret" "$D/"
```

The paths in the backup are those of the old server. If the new one runs the same way (Compose with Docker
or Quadlet), they are the same; otherwise `restic snapshots` shows them in the column *Paths*, and instead of
`/tmp/restore$S` it is then `/tmp/restore<old path>`. Restic restores owners and permissions
too, and `cp -a` keeps them.

With Quadlet, in steps 3 and 5 name only the units that exist on the server (without Documents
no `schreibzeug`, without calls no `redis`, `livekit`, `livekit-sip`).

**5. Start and check:**

```bash
docker compose -f compose.yaml up -d                                      # Compose
systemctl start stalwart redis livekit livekit-sip kontext schreibzeug caddy   # Quadlet
```

Then sign in to Kontext: mails, appointments, tasks and chat are back. If the IP addresses change on
a new server, update the DNS records (A, PTR). Delete `/tmp/restore` at the
end.

If the copy of the Kontext database is missing, nothing in Stalwart is lost: everyone signs in
once more, and the template of the company signature has to be entered again; tasks and chat are then empty.

## 6. Updates { #6-updates }

What changed in each version, and which versions need an extra step, is in the
[changelog](https://github.com/firsttris/kontext/blob/main/CHANGELOG.md). Make a backup first
(`systemctl start kontext-backup.service` or "Back up now" in the company admin).

**With Compose:**

```bash
cd /opt/kontext && git pull
git diff ORIG_HEAD -- deploy/    # what changed in deploy/: .env.example, compose.yaml, Caddyfile, units
nano deploy/.env                 # KONTEXT_VERSION to the new version, e.g. 0.1.6; take over new lines from .env.example
docker compose -f deploy/compose.yaml pull && docker compose -f deploy/compose.yaml up -d
```

- `deploy/.env` is your own copy of `.env.example` and does not change with `git pull`. New
  settings are shown by `git diff ORIG_HEAD -- deploy/.env.example` (or by comparing the two
  files); take over into `.env` what is new there.
- `KONTEXT_VERSION` raises Kontext; the current version is in `.env.example` and under
  [Releases](https://github.com/firsttris/kontext/releases). `SCHREIBZEUG_VERSION` raises
  Schreibzeug, which has versions of its own ([Schreibzeug's releases](https://github.com/firsttris/schreibzeug/releases));
  if the line is missing, `compose.yaml` takes `latest`.
- Stalwart, LiveKit, LiveKit SIP, Redis and Caddy have fixed versions in
  `deploy/compose.yaml`; new ones come with `git pull`, and `pull` fetches them.
- If `deploy/Caddyfile` has changed, reload Caddy:
  `docker compose -f deploy/compose.yaml restart caddy`.
- If the units in `deploy/systemd/` have changed, run `./backup-control.sh install` in `deploy/`
  again.

**With Quadlet:** the files under `/etc/containers/systemd/` are copies from `deploy/quadlet/`
with your own domain ([Setting up a VPS, step 9](vps.md#9-kontext-mit-quadlet-starten)); `git
pull` does not change them.

```bash
cd /opt/kontext && git pull
git diff ORIG_HEAD -- deploy/              # new image versions, settings, units
cd /etc/containers/systemd
nano kontext.container schreibzeug.container   # Image=…/kontext:<new version>, …/schreibzeug:<new version>
systemctl daemon-reload
for i in $(grep -h '^Image=' *.container | cut -d= -f2); do podman pull $i; done
systemctl restart kontext schreibzeug          # and every service whose image has changed
```

If more has changed in `deploy/quadlet/` than the version (say, a new `Environment=` line),
take that over into the copy too; `deploy/Caddyfile` is included directly, then
`systemctl restart caddy`.

The images do not update themselves (not with Podman auto-update either): a new one only comes
when you raise the version. Exceptions that stay on `latest` until you enter a version:
Schreibzeug with Compose without `SCHREIBZEUG_VERSION`, and the phone box (see
[Telephony](#telefonie)).

Since 0.1.3 the Kontext server no longer runs as root, but as the user `bun`. A volume from
an older version still belongs to root; hand it over once, then start:

```bash
docker compose -f deploy/compose.yaml run --rm --user root --entrypoint chown kontext -R bun:bun /data
docker compose -f deploy/compose.yaml up -d
```

Before a Stalwart update to a new major version, read Stalwart's `UPGRADING` notes and
make a backup first. After every update, run the [setup command](#einrichtungsbefehl) again; it
only adds what a new version needs and is still missing.

### Stalwart 1.0.3 { #stalwart-103 }

Stalwart 1.0.3 no longer knows *first-party* clients: a registered client only gets
the scopes it requests and that it allows. For this, Kontext requests the
scope `urn:stalwart:oauth:scope:full` from this version on. So the client `kontext` needs the scope
**Full**, otherwise Stalwart rejects every new sign-in. The [setup command](#einrichtungsbefehl)
adds it: run it once after updating Kontext and Stalwart. By hand it goes under *Management →
Directory → OAuth Clients* (as a superuser) or with the helper from
[Setting up a VPS, step 10](vps.md#10-stalwart-ohne-oberflache-einrichten):

```bash
/root/stalwart-api.sh '[["x:OAuthClient/get",{"ids":null,"properties":["clientId","scopes"]},"0"]]'
/root/stalwart-api.sh '[["x:OAuthClient/set",{"update":{"<id von kontext>":{"scopes/full":true}}},"0"]]'
```

Kontext and Stalwart go together in this update: Stalwart 1.0.3
with a Kontext up to 0.1.22 lets nobody sign in anew, because the old Kontext does not request the scope.
Everyone signs in once more: Stalwart discards grants from the time as a
*first-party* client as soon as Kontext renews the token (`invalid_grant`,
`crates/http/src/auth/oauth/token.rs`); Kontext then ends the session and shows the
sign-in. Started once with the
environment variable `STALWART_UPDATE_ROLE_PERMISSIONS=true`, Stalwart adds to the
default roles the permissions that have come along since 1.0.0 (such as encryption in the
admin interface); remove the variable again afterwards. Kontext does not need this.

### Upgrading Stalwart 0.16 to 1.0 { #stalwart-016-auf-10-heben }

Kontext from this version on needs Stalwart 1.0. Stalwart 1.0 stores its data differently and
does not open the 0.16 database (`The data store was created by a Stalwart version prior to
1.0 and cannot be opened by this version`): a `git pull` with `up -d` alone leaves Stalwart unable
to start, but no data is lost in the process. Stalwart's
migration tool [`stalwart-migrate`](https://github.com/stalwartlabs/stalwart-migrate) copies the data into
a new, empty database; it only reads the old one. In detail:
[Stalwart's guide](https://stalw.art/docs/migration/upgrade-0-16/).

Use `stalwart-migrate` **from version 1.0.4 on**: 1.0.0 to 1.0.3 abort `run --final` during the
check as soon as there are contacts (`contactCard … differs in the target: vcard`, for every vCard
whose `N` has empty fields at the end; that is how 0.16 stores them). The old database stays
untouched in that case; starting Stalwart 0.16 again is enough.

1. Make a **backup** ([Backups](#5-backups)) and check that Stalwart 0.16.27 is running (raise earlier 0.16
   versions to 0.16.27 first). Kontext and Stalwart stay on the old version for now.
2. With the Docker image `stalwartlabs/stalwart-migrate:1.0.4` (Stalwart's network, volumes and environment,
   new volumes for the 1.0 data and the state of the migration), run `prepare` first. It
   asks about what cannot be translated by itself – among other things the client address behind
   Caddy: *X-Forwarded-For* with one proxy, as in [step 5](#3-stalwart-einrichten).
3. Stop Stalwart, run `run --final` and read the report.
4. Put the new data volume in Stalwart's place, `git pull` (Kontext and Stalwart 1.0.1),
   start.
5. In Stalwart 1.0, register Kontext as an OAuth client and allow directory queries
   ([steps 12 and 13](#3-stalwart-einrichten)).
6. Everyone signs in once more: Stalwart's tokens do not move along, and Kontext withdraws the
   rejected sessions. Mail programs with a password keep working; CalDAV and CardDAV
   reload calendars and contacts once, and Stalwart rebuilds the full-text search in the background.
   Kontext up to 0.1.16 only passes the rejection on: the app keeps trying with the old token
   again and again until Stalwart blocks the person's address for a day (the app only shows
   "Something went wrong", see [Troubleshooting](#fehlersuche)). In that case, delete the
   old tokens before starting Kontext:
   `… exec kontext bun -e 'import {Database} from "bun:sqlite"; new Database("/data/kontext.db").run("delete from stalwart_grant")'`
   (`docker compose -f deploy/compose.yaml` or `podman` for `…`).

**With Quadlet**, on one server it looked like this (volumes `stalwart-config` and `stalwart-data`,
network `kontext`). Take the values of the two `Environment=` lines from `stalwart.container`:

```bash
mig() { podman run --rm --network kontext \
  -e STALWART_HOSTNAME=mail.firma.de -e STALWART_PUBLIC_URL=https://kontext.firma.de \
  -v stalwart-config:/etc/stalwart:ro -v stalwart-data:/var/lib/stalwart \
  -v stalwart-v1-config:/etc/stalwart-v1 -v stalwart-v1-data:/var/lib/stalwart-v1 \
  -v stalwart-migrate-state:/var/lib/stalwart-migrate \
  docker.io/stalwartlabs/stalwart-migrate:1.0.4 "$@" \
  --source /etc/stalwart/config.json --state /var/lib/stalwart-migrate; }
V=/var/lib/containers/storage/volumes
for v in stalwart-v1-config stalwart-v1-data stalwart-migrate-state; do podman volume create $v; done
# In the 1.0 container, the new database is later under /var/lib/stalwart again
echo '{"@type":"RocksDb","path":"/var/lib/stalwart/"}' > $V/stalwart-v1-config/_data/config.json
chown -R 2000:2000 $V/stalwart-v1-config/_data $V/stalwart-v1-data/_data
mig prepare --non-interactive      # writes answers.toml with the open questions
nano $V/stalwart-migrate-state/_data/answers.toml   # uncomment the tables (recommendations)
T="--target /etc/stalwart-v1/config.json --target-path-map /var/lib/stalwart=/var/lib/stalwart-v1"
mig prepare --non-interactive      # "Every question has an answer"
mig run $T && mig verify --full $T # trial run on the running server, without downtime
systemctl start kontext-backup
systemctl stop schreibzeug kontext stalwart
mig run --final --yes $T           # must end with "verify: … 0 mismatches"
# Keep the 0.16 data (rollback), put the 1.0 data in its place
for v in config data; do
  podman volume create stalwart-016-$v
  cp -a $V/stalwart-$v/_data/. $V/stalwart-016-$v/_data/
  rm -rf $V/stalwart-$v/_data/*
  cp -a $V/stalwart-v1-$v/_data/. $V/stalwart-$v/_data/
done
```

Then raise the images in `/etc/containers/systemd/` as under [Updates](#6-updates), `systemctl
daemon-reload`, `systemctl start stalwart`, steps 5 and 6 above, then start Kontext and
Schreibzeug. `stalwart-v1-*` are no longer needed after that; `stalwart-016-*` and
`stalwart-migrate-state` (for `rollback --forward-state`) stay until 1.0 has been running for a while.

Only delete the old volume once 1.0 has been running for a while: `stalwart-migrate rollback` copies the
data back to 0.16 if need be.

Kontext and Schreibzeug have separate images and versions (`KONTEXT_VERSION`,
`SCHREIBZEUG_VERSION`); on start, Kontext only checks whether Schreibzeug answers, and otherwise writes
a warning to the log.

## Settings at a glance { #einstellungen-im-uberblick }

### `deploy/.env` (Compose) { #deployenv-compose }

`compose.yaml` reads this file and passes on to each service only what it needs;
`backup.sh` reads all of it. With Quadlet it does not exist: there the values are in the
`.container` files and in `kontext.env`, `livekit.env` …, the backup values in `backup.env`.

| Variable | Default | What for |
| --- | --- | --- |
| `KONTEXT_DOMAIN` | – | Kontext's address in the browser; Caddy gets the certificate, Kontext gets `https://<…>` as `BETTER_AUTH_URL`, Stalwart as its public address |
| `STALWART_HOSTNAME` | – | name of the mail server (MX, reverse DNS) |
| `MAIL_DOMAIN` | empty | the mail domain: Caddy serves `mta-sts.<…>` (MTA-STS) and `openpgpkey.<…>` (WKD) |
| `ACME_EMAIL` | – | address for Let's Encrypt |
| `TAILSCALE_IP` | `127.0.0.1` | where Stalwart's admin interface (port 8080) listens; with Tailscale, the server's Tailscale address |
| `KONTEXT_SECRET` | – | required, at least 32 characters; becomes `BETTER_AUTH_SECRET` |
| `STALWART_ADMIN_KEY` | empty | API key for the [company admin](#firmenverwaltung-einschalten) |
| `KONTEXT_VERSION` | – | required: version of the image `tristanteu/kontext` |
| `COMPOSE_PROFILES` | – | `calls` (LiveKit, LiveKit SIP, Redis) and `documents` (Schreibzeug) |
| `LIVEKIT_SECRET` | empty | secret for LiveKit and LiveKit SIP; empty: no calls |
| `SCHREIBZEUG_URL` | empty | address of Documents; empty: no module |
| `SCHREIBZEUG_CLIENT_SECRET` | empty | secret with which Schreibzeug signs in to Kontext |
| `SCHREIBZEUG_VERSION` | `latest` | version of the image `tristanteu/schreibzeug` |
| `PLACES_URL` | komoot's Photon | location suggestions; empty: off ([Location suggestions](#ortsvorschlage)) |
| `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` | – | target and password of the [backups](#5-backups) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | – | keys for an S3 target |
| `BACKUP_WARN_GB` | `8` | from this backup size on, `backup.sh` writes a warning |

### The Kontext server { #der-kontext-server }

What the server itself reads (`server/env.ts`). Of these, `compose.yaml` sets only the lines under
`kontext: environment:`; with Quadlet they are in `kontext.container` and `kontext.env`. The
image sets `PORT=3000`, `STATIC_DIR=/app/dist`, `DATABASE_PATH=/data/kontext.db` and
`NODE_ENV=production`. The defaults in the table are those without the image (development).

| Variable | Default | What for |
| --- | --- | --- |
| `PORT` | `18090` | the server's port (3000 in the image) |
| `STALWART_URL` | `http://127.0.0.1:18080` | Stalwart's HTTP, directly (in Compose `http://stalwart:8080`) |
| `BETTER_AUTH_URL` | `http://localhost:5173` | Kontext's public address |
| `BETTER_AUTH_SECRET` | – | required, at least 32 characters, no `change-me`: signs the sessions, encrypts the Stalwart tokens |
| `DATABASE_PATH` | `.dev/server/kontext.db` | the SQLite database (`/data/kontext.db` in the image) |
| `SIGN_IN_PER_MINUTE` | `10` | sign-ins per minute and IP address |
| `STALWART_ADMIN_KEY` | empty | API key (`API_…`) or `name:passwort` for the company admin |
| `DOH_URL` | `https://cloudflare-dns.com/dns-query` | DNS over HTTPS (JSON API) for "Email security" and the search for S/MIME certificates |
| `SMIME_ROOTS` | empty | path to a PEM file with further recognized S/MIME authorities, such as the public administration's PKI; easier in the company admin under "S/MIME authorities" |
| `LIVEKIT_URL` | empty | LiveKit's API as the server reaches it (in Compose `http://livekit:7880`) |
| `LIVEKIT_API_KEY` | empty | LiveKit key (in Compose `kontext`) |
| `LIVEKIT_API_SECRET` | empty | LiveKit secret, at least 32 characters; without these three, no calls |
| `LIVEKIT_PUBLIC_URL` | empty | where browsers reach LiveKit, if not through Kontext's address (`/rtc` through Caddy) |
| `PHONE_SIP_HOST` | host of `BETTER_AUTH_URL` | where the phone boxes reach LiveKit SIP |
| `PHONE_SIP_PORT` | `5060` | SIP port (TCP) for that |
| `SCHREIBZEUG_URL` | empty | Schreibzeug's address; with it, there is "Documents" |
| `SCHREIBZEUG_CLIENT_ID` | `schreibzeug` | Schreibzeug's client ID (its `OIDC_CLIENT_ID`) |
| `SCHREIBZEUG_CLIENT_SECRET` | empty | its `OIDC_CLIENT_SECRET`, at least 32 characters |
| `PLACES_URL` | `https://photon.komoot.io/api/` | Photon for location suggestions; empty: off |
| `STATIC_DIR` | empty | the built app; when set, the server serves it as well |
| `NODE_ENV` | – | `production` in the image; otherwise the server uses development values (a fixed secret, admin and LiveKit from `dev/config.ts`) |

For tests only: `MAIL_SYNC_ALLOW_PLAIN`, `UNSUBSCRIBE_ANY_TARGET`, `CALENDAR_SUBSCRIBE_ANY_TARGET`, `PUSH_ANY_ENDPOINT`,
`SNOOZE_TICK_MS`, `REMINDER_TICK_MS`, `RULE_TASK_TICK_MS`, `M365_LOGIN_URL` and `GRAPH_URL`
(see [Development](development.md)).

**Variables that `compose.yaml` does not pass on** (`DOH_URL`, `SMIME_ROOTS`,
`LIVEKIT_PUBLIC_URL`, `PHONE_SIP_HOST`, `PHONE_SIP_PORT`, `SIGN_IN_PER_MINUTE`): entered in `.env`,
they do not arrive in the container. With Compose they belong as a line under
`kontext: environment:` in `deploy/compose.yaml` – a local change; if a `git pull` runs into
the same spot, `git stash` before and `git stash pop` after. A PEM file for `SMIME_ROOTS` must
also get into the container:

```yaml
  kontext:
    environment:
      # … the existing lines
      SMIME_ROOTS: /etc/kontext/smime-roots.pem
      DOH_URL: https://<eigener DoH-Dienst mit JSON-API>/dns-query
    volumes:
      - kontext-data:/data
      - ./smime-roots.pem:/etc/kontext/smime-roots.pem:ro
```

The file then sits next to it as `deploy/smime-roots.pem` and must be readable for the user `bun` in the
container (`chmod 644`). With Quadlet, the variables go into `kontext.env` and the
file into `kontext.container` with `Volume=/opt/kontext/deploy/smime-roots.pem:/etc/kontext/smime-roots.pem:ro`;
then `systemctl daemon-reload` and `systemctl restart kontext`.

## Troubleshooting { #fehlersuche }

The logs: `docker compose -f deploy/compose.yaml logs <dienst>` (Compose) or
`podman logs <dienst>` (Quadlet), for the backup `journalctl -u kontext-backup`.

- **Nobody can sign in any more, even with the right password:** Stalwart has blocked Kontext's address.
  Kontext signs in everyone from one address; without the entry **`10.89.250.0/24`** among
  the allowed IPs ([Setting up Stalwart](#3-stalwart-einrichten), step 6), Stalwart blocks
  it after 100 failed attempts a day. Add the entry and delete the ban: Stalwart keeps
  it as `BlockedIp` (through the API `x:BlockedIp/get`, then `x:BlockedIp/set` with `destroy`;
  helper in [Setting up a VPS, step 10](vps.md#10-stalwart-ohne-oberflache-einrichten)). With
  a ban duration (step 7) it expires by itself. If Kontext's log says `Stalwart lehnt
  die Anmeldung für Kontext ab` ("Stalwart rejects the sign-in for Kontext"), the OAuth client `kontext` or its scope `full`
  is missing (step 12, [Stalwart 1.0.3](#stalwart-103)); if `invalid_scope` is next to it, it is the scope.
- **For one person the app only shows "Something went wrong":** Stalwart has blocked this
  person's address (`Banned due to authentication errors … remoteIp = <their address>` in Stalwart's
  log), for example because Kontext up to 0.1.16 kept sending old tokens after the move to
  Stalwart 1.0. Delete the ban with `x:BlockedIp/set` and `destroy` and then trigger the action
  `ReloadBlockedIps` (`x:Action/set` with `{"@type":"ReloadBlockedIps"}`). Without it,
  Stalwart 1.0 keeps the ban in memory and keeps answering with 403, even though it is no longer
  in the list.
- **No certificate, the browser warns:** Caddy gets the certificates on start
  (`logs caddy`). The A records must point to the server beforehand and, at Cloudflare, must
  not go through the proxy (see [Server and DNS](#1-server-und-dns)); ports 80 and 443 must
  be open. If the server asked before the records existed, its resolver remembers that for a while
  ([Setting up a VPS, step 7](vps.md#7-dns-bei-cloudflare)).
- **Mails do not arrive or land in spam:** port 25 unblocked at the provider, reverse DNS
  set ([Setting up a VPS, step 5](vps.md#5-mail-sperre-aufheben)), SPF, DKIM and DMARC
  set; the company admin checks under "Email security" what is missing. Blocklists:
  [Setting up a VPS, step 12](vps.md#12-mail-umstellen).
- **"Schreibzeug antwortet nicht" ("Schreibzeug does not answer") in Kontext's log:** harmless on the first start if
  Schreibzeug did not find Kontext yet ([Setting up a VPS, step 9](vps.md#9-kontext-mit-quadlet-starten)).
  If it stays, check whether `SCHREIBZEUG_URL` is in the DNS (`getent hosts dokumente.firma.de` on the
  server) and the service is running (`logs schreibzeug`).
- **New mails only appear after reloading:** push needs a connection that a proxy
  does not buffer. It does not get through the Cloudflare proxy (see [Server and DNS](#1-server-und-dns));
  a proxy of your own in front of Caddy must pass `/api/live` and `/jmap/eventsource` through unbuffered and
  uncompressed, as `deploy/Caddyfile` itself does.
- **Calls without sound or picture:** TCP 7881 and UDP 7882 open, behind NAT set `node_ip`
  ([Calls](#anrufe)).
- **The phone box does not register with the Fritzbox:** see [Telephony](#telefonie), "If the
  box does not register with the Fritzbox"; a box before v0.1.4 cannot do it.
- **"Control isn’t set up on the server" under Backup:** the systemd units are
  not installed or not running ([Backups](#5-backups)).
- **Other mailboxes are missing from the settings, invitations have no buttons:**
  `STALWART_ADMIN_KEY` is missing ([Turning on the company admin](#firmenverwaltung-einschalten)).
  If only the company admin is missing, your own account in Stalwart does not have the role
  `Firmenverwaltung (Kontext)` yet (step 4 there).
