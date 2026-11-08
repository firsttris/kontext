---
description: >-
  Setting up a new VPS for Kontext: SSH with keys only, mail block and reverse DNS at the
  provider, Podman and Quadlet, DNS at Cloudflare, a firewall with nftables, Stalwart without
  the web interface, backups to Cloudflare R2, moving the mail over, automatic updates.
---

# Setting up a VPS – first steps { #vps-einrichten-erste-schritte }

Before Kontext goes onto a new server ([Installation](installation.md)), access is locked down:
sign-in with an SSH key only, no more password login. The examples assume a fresh Debian/Ubuntu
VPS (at netcup, for instance) with the IP `203.0.113.10`.

What happens where:

| Step                            | Where                  |
| ------------------------------- | ---------------------- |
| 1. Set the root password        | Provider's customer area |
| 2. Key onto the server          | Your own computer      |
| 3. Short name in `~/.ssh/config` | Your own computer     |
| 4. Turn off password login      | Server                 |
| 5. Lift the mail block          | Provider's customer area |
| 6. Install Podman               | Server                 |
| 7. DNS at Cloudflare            | Cloudflare and server  |
| 8. Firewall                     | Server                 |
| 9. Start Kontext with Quadlet   | Server                 |
| 10. Set up Stalwart without the web interface | Server   |
| 11. Backup to Cloudflare R2     | Cloudflare and server  |
| 12. Move the mail over          | Cloudflare and server  |
| 13. Keep the credentials safe   | Password manager       |
| 14. Automatic updates           | Server                 |

## 1. Set the root password { #1-root-passwort-setzen }

You often can't sign in to a new VPS yet: `ssh root@…` ends with **Permission denied**. Then
`root` has no password set yet (or one you don't know). At netcup, set a new root password in
the Server Control Panel under *Server → Access*; after that it works:

```bash
ssh root@203.0.113.10
```

If it still doesn't work, `ssh -v root@203.0.113.10` shows what the server allows in the line
`Authentications that can continue:`. If it only says `publickey`, password login is already
off. The provider's console remains as emergency access (at netcup *Screen*); it is a local login
and needs no SSH.

## 2. Key onto the server { #2-schlussel-auf-den-server }

On **your own computer**. No key yet? Create one:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/privat_ed25519
```

Copy the public part to the server – `ssh-copy-id` asks for the root password one last time and
appends the key to `~/.ssh/authorized_keys` on the server:

```bash
ssh-copy-id -i ~/.ssh/privat_ed25519.pub root@203.0.113.10
```

Without `ssh-copy-id` (Windows, PowerShell):

```powershell
type $env:USERPROFILE\.ssh\privat_ed25519.pub | ssh root@203.0.113.10 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

!!! tip "Keybund"
    With [Keybund](https://github.com/firsttris/keybund) this works without a terminal too: add
    the server, assign the key, **Add key**, then **Test**.

## 3. Short name in `~/.ssh/config` { #3-kurzname-in-sshconfig }

If you have several keys, name the right one explicitly – otherwise `ssh` tries them all and the
server gives up with *Too many authentication failures*. On **your own computer**, in
`~/.ssh/config`:

```
Host kunde-vps
    HostName 203.0.113.10
    User root
    IdentityFile ~/.ssh/privat_ed25519
    IdentitiesOnly yes
```

After that, `ssh kunde-vps` is enough. Check that it gets in **without asking for a password**
before going on.

## 4. Turn off password login { #4-passwort-login-abschalten }

On the **server**. Keep the session you are signed in with open until a new sign-in with the key
has worked.

Create a file of its own under `sshd_config.d/` (one line, to copy):

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/00-keyonly.conf
```

The `00-` in the name matters: for `sshd` the **first** value found wins, and many images come
with a `50-cloud-init.conf` containing `PasswordAuthentication yes` that would win otherwise.

Test, restart and check:

```bash
sshd -t && systemctl restart ssh && sshd -T | grep -Ei 'passwordauth|permitroot'
```

Expected:

```
permitrootlogin without-password
passwordauthentication no
```

Finally, `ssh kunde-vps` from a **second terminal** – if the sign-in goes through, the server can
only be reached with the key.

!!! note "Locked out?"
    Sign in through the provider's console with the root password,
    `rm /etc/ssh/sshd_config.d/00-keyonly.conf && systemctl restart ssh`, repeat step 2.

## 5. Lift the mail block { #5-mail-sperre-aufheben }

A new netcup VPS may not send mail: the firewall in the Server Control Panel comes with the rule
group **"netcup Mail block"**, which drops outgoing traffic on ports **25, 465 and 587**. Kontext
needs all three: Stalwart delivers to other mail servers over 25, and connected external
mailboxes (Gmail, GMX …) send over 465 or 587 (`server/external/smtp.ts`).

In the Server Control Panel under *Server → Firewall*, **delete the group "netcup Mail block"**
and save. Incoming, that firewall lets everything through; the server itself does the shielding.

Check on the **server** (it can take a few minutes for the change to take effect):

```bash
timeout 5 bash -c 'echo > /dev/tcp/gmail-smtp-in.l.google.com/25' && echo offen || echo gesperrt
```

At netcup, **reverse DNS** (PTR) is not set in the Server Control Panel but in the **Customer
Control Panel** under *Products → (the server) → rDNS*: for the IPv4 address, enter the mail
server's name (`mail.firma.de`) as hostname, *Change hostname*. Without a matching PTR, mail
quickly ends up in spam. IPv6 needs no entry: the containers only have IPv4, and Stalwart sends
over the IPv4 address. Check: `dig +short -x 203.0.113.10`.

## 6. Install Podman { #6-podman-installieren }

Kontext runs with Podman and Quadlet: every service is a systemd unit, starts with the server
and needs no daemon. The files are in `deploy/quadlet/`. On the **server**:

```bash
apt-get update && apt-get install -y git podman
git clone https://github.com/firsttris/kontext /opt/kontext
```

Debian 13 ships Podman 5.4, Quadlet included. Don't install Docker on top: it sets up firewall
rules of its own that get in the way of Podman's network. If it is already there, remove it with
`apt-get purge docker-ce docker-ce-cli containerd.io docker-compose-plugin` and delete the
leftover tables (`nft list tables` shows them, `nft delete table ip nat` and so on).

## 7. DNS at Cloudflare { #7-dns-bei-cloudflare }

If the domain is at Cloudflare, the server gets an **API token**: Stalwart uses it to fetch its
certificate for `mail.firma.de` (ACME DNS-01, see [Installation](installation.md#3-stalwart-einrichten)),
and the records can be set from the server.

In the Cloudflare dashboard under *Profile → API Tokens → Create Token*, the template **"Edit
zone DNS"**:

- *Zone Resources*: only the one zone (`firma.de`), not all the zones in the account;
- *Client IP Address Filtering*: the server's IPv4 address and its IPv6 network (`…::/64`) –
  then the token is useless anywhere else;
- *TTL*: no expiry; Stalwart renews the certificate every few weeks.

Store the token on the server, readable only by root:

```bash
umask 077 && nano /root/.cloudflare-token
```

Check it and look at the existing records:

```bash
T=$(cat /root/.cloudflare-token)
curl -s -H "Authorization: Bearer $T" "https://api.cloudflare.com/client/v4/zones?name=firma.de" \
  | grep -o '"id":"[a-f0-9]\{32\}"' | head -1        # the zone ID
curl -s -H "Authorization: Bearer $T" "https://api.cloudflare.com/client/v4/zones/<zonen-id>/dns_records"
```

If the domain's mail currently runs through **Cloudflare Email Routing** (MX on
`route1.mx.cloudflare.net` …), it stays that way until the very end: only once the server is
running is Email Routing turned off and the MX switched.

For the server, at first only the A records, all **DNS only** (grey cloud), pointing to the
server's IP: `kontext`, `mail`, `dokumente`, `mta-sts` and `openpgpkey`. The website and the
current mail are not affected.

Check (after a few minutes at every resolver; the provider's resolver remembers an earlier
"doesn't exist" a little longer):

```bash
apt-get install -y bind9-dnsutils
for n in kontext mail dokumente mta-sts openpgpkey; do dig +short $n.firma.de @1.1.1.1; done
```

Create the records **before** the first start and wait until the server itself resolves them
too (`getent hosts kontext.firma.de`): if it has asked before, the provider's resolver remembers
the "doesn't exist" for up to 30 minutes (at Cloudflare), and Schreibzeug doesn't find Kontext
when it starts.

## 8. Firewall { #8-firewall }

From outside, only SSH should reach the server itself. Podman forwards the containers' ports
(web, mail, calls) (netavark: DNAT, then *forward*); they don't pass through the server's input
chain and need no rule there. **No ufw**: it drops forwarded packets and with them the container
ports. Use nftables instead, in `/etc/nftables.conf`:

```
#!/usr/sbin/nft -f
# No "flush ruleset": that would throw away Podman's rules too.
table inet hostfw
delete table inet hostfw

table inet hostfw {
	chain input {
		type filter hook input priority filter; policy drop;
		ct state established,related accept
		ct state invalid drop
		iif lo accept
		meta l4proto { icmp, ipv6-icmp } accept
		tcp dport 22 accept
		# Containers ask Podman's DNS (aardvark) at the bridge's gateway
		iifname "podman*" accept
	}
}
```

```bash
nft -c -f /etc/nftables.conf && nft -f /etc/nftables.conf && systemctl enable --now nftables
```

Keep the SSH session you are signed in with open and check from a second terminal that `ssh`
still works.

## 9. Start Kontext with Quadlet { #9-kontext-mit-quadlet-starten }

Each service gets only its own settings, in a file under `/opt/kontext/deploy/`, readable only by
root (they are in `.gitignore`). The secrets for LiveKit and Schreibzeug are hex, because the
LiveKit secret also appears in YAML:

```bash
cd /opt/kontext/deploy && umask 077
KS=$(openssl rand -base64 48 | tr -d '\n'); LS=$(openssl rand -hex 32); SS=$(openssl rand -hex 32)
printf '%s\n' "BETTER_AUTH_URL=https://kontext.firma.de" "BETTER_AUTH_SECRET=$KS" \
  "STALWART_ADMIN_KEY=" "LIVEKIT_API_SECRET=$LS" \
  "SCHREIBZEUG_URL=https://dokumente.firma.de" "SCHREIBZEUG_CLIENT_SECRET=$SS" > kontext.env
printf '%s\n' "SCHREIBZEUG_URL=https://dokumente.firma.de" \
  "SCHREIBZEUG_EMBED_ORIGIN=https://kontext.firma.de" \
  "OIDC_ISSUER=https://kontext.firma.de/api/auth" "OIDC_CLIENT_SECRET=$SS" > schreibzeug.env
echo "LIVEKIT_KEYS=kontext: $LS" > livekit.env
echo "SIP_CONFIG_BODY={api_key: kontext, api_secret: \"$LS\", ws_url: \"ws://livekit:7880\", redis: {address: \"redis:6379\"}, sip_port: 5060, rtp_port: \"20000-20100\", use_external_ip: true, symmetric_rtp: true, hide_inbound_port: true, logging: {level: warn}}" > livekit-sip.env
echo "STALWART_BLOB_KEY=$(openssl rand -base64 32)" > stalwart.env
umask 022
```

`stalwart.env` holds the [storage key](installation.md#speicher-verschlusseln) Stalwart encrypts
mails and files with; put it in the password manager ([step 13](#13-zugangsdaten-sichern)).

`SIP_CONFIG_BODY` is on one line (YAML in flow style): an env file has no values spanning
several lines.

Copy the Quadlet files and fill in the domain and the Let's Encrypt address (Quadlet doesn't
substitute variables) – in the `.container` files and in the `kontext.env` and `schreibzeug.env`
just written, which contain the example domain too. The phone box (`kontext-box.container`) runs
in the office, not here:

```bash
cp quadlet/*.network quadlet/*.container /etc/containers/systemd/
rm /etc/containers/systemd/kontext-box.container
sed -i 's/firma\.de/meinefirma.de/g' kontext.env schreibzeug.env
cd /etc/containers/systemd
sed -i 's/firma\.de/meinefirma.de/g' *.container
sed -i 's/^Environment=ACME_EMAIL=.*/Environment=ACME_EMAIL=admin@meinefirma.de/' caddy.container
sed -i 's|^#EnvironmentFile=|EnvironmentFile=|' stalwart.container
grep -h 'firma\.de' *.container /opt/kontext/deploy/*.env   # every line now names your own domain
systemctl daemon-reload
```

Run each `sed` only once: `meinefirma.de` itself contains `firma.de`.

Pull the images and start. After that they start with the server on their own (`[Install]` in
every file):

```bash
for i in $(grep -h '^Image=' *.container | cut -d= -f2); do podman pull $i; done
systemctl start stalwart redis livekit livekit-sip kontext schreibzeug caddy
podman ps
```

Caddy fetches the certificates right at the start (`podman logs caddy`). If Schreibzeug doesn't
find Kontext when it starts (DNS not there yet, Kontext still starting), its log says
`Discovery fetch failed … Provider skipped` and Kontext's says `Schreibzeug antwortet nicht`
("Schreibzeug isn't answering"): harmless, Better Auth asks again on the first "Sign in with
Kontext" (`retryDiscovery` in `better-auth/plugins/generic-oauth`); no restart is needed.
Stalwart's log contains the temporary admin password (`podman logs stalwart`). Stalwart's
management can only be reached on the server itself; from your own computer through a tunnel,
then `http://localhost:8080` in the browser:

```bash
ssh -L 8080:127.0.0.1:8080 kunde-vps
```

Then go on with [Setting up Stalwart](installation.md#3-stalwart-einrichten) – in the web
interface, or directly on the server as below.

## 10. Set up Stalwart without the web interface { #10-stalwart-ohne-oberflache-einrichten }

Everything in [Setting up Stalwart](installation.md#3-stalwart-einrichten) can also be done
through Stalwart's management API (JMAP, `x:<Objekt>/get|set`, the objects in Stalwart's
`crates/registry/src/schema/structs.rs`), on the server against `127.0.0.1:8080`.

!!! danger "Otherwise Stalwart writes to the DNS itself"
    With a Cloudflare token at the initial setup, Stalwart creates **MX, SPF (`mx -all`) and
    DMARC (`p=reject`)** and so switches the domain's mail to the new server at once – even if it
    still runs somewhere else. So do the initial setup without DNS (`Manual`), and afterwards use
    the token only for the certificate and the DKIM keys.

A small helper (the credentials are in `/root/.stalwart-admin` as `name:password`):

```bash
cat > /root/stalwart-api.sh <<'SH'
#!/bin/sh
exec curl -s -u "$(cat /root/.stalwart-admin)" http://127.0.0.1:8080/jmap/ -H 'content-type: application/json' \
  -d "{\"using\":[\"urn:ietf:params:jmap:core\",\"urn:stalwart:jmap\"],\"methodCalls\":$1}"
SH
chmod 700 /root/stalwart-api.sh
```

**Initial setup.** With the temporary password from `podman logs stalwart` (user `admin`; a new
one after every restart before the setup). Without a certificate and without DNS; Stalwart
generates the DKIM keys, and the log goes to `podman logs`:

```bash
curl -s -u 'admin:<vorläufiges-passwort>' http://127.0.0.1:8080/jmap/ -H 'content-type: application/json' -d '{
  "using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
  "methodCalls":[["x:Bootstrap/set",{"update":{"singleton":{
    "defaultHostname":"mail.firma.de","defaultDomain":"firma.de",
    "requestTlsCertificate":false,"generateDkimKeys":true,"dnsServer":{"@type":"Manual"},
    "tracer":{"@type":"Stdout","ansi":false,"multiline":false,"enable":true,"level":"info",
              "lossy":false,"buffered":true,"events":{},"eventsPolicy":"exclude"}}}},"0"]]}'
```

The answer contains the permanent admin (`admin@firma.de`) and its password: save it as
`admin@firma.de:<password>` to `/root/.stalwart-admin` (`chmod 600`), then
`systemctl restart stalwart`. Only after that do the mail ports run.

**Certificate for `mail.firma.de`** via DNS-01 through Cloudflare (Caddy has port 443). Stalwart
only fetches it with DNS management; `publishRecords` needs at least one type, and `dkim` is
harmless (names of its own, `v1-…._domainkey`; other DKIM records stay). Fill in the ids from the
answers of `x:Domain/get`, `x:DnsServer/get`, `x:AcmeProvider/get`:

```bash
/root/stalwart-api.sh '[
 ["x:DnsServer/set",{"create":{"cf":{"@type":"Cloudflare","secret":{"@type":"Value","secret":"<cloudflare-token>"}}}},"0"],
 ["x:AcmeProvider/set",{"create":{"le":{"challengeType":"Dns01","contact":{"admin@firma.de":true},
   "directory":"https://acme-v02.api.letsencrypt.org/directory"}}},"1"]]'
/root/stalwart-api.sh '[["x:Domain/set",{"update":{"<domain-id>":{
   "certificateManagement":{"@type":"Automatic","acmeProviderId":"<acme-id>","subjectAlternativeNames":{"mail.firma.de":true}},
   "dnsManagement":{"@type":"Automatic","dnsServerId":"<dns-id>","origin":null,"publishRecords":{"dkim":true}}}}},"0"]]'
```

After a minute or two the log says `ACME order completed`; Stalwart renews it on its own.

**Port 587.** Stalwart's default listeners have 465 but not 587 (STARTTLS), which many mail
programs use:

```bash
/root/stalwart-api.sh '[["x:NetworkListener/set",{"create":{"sub":{"name":"submission","protocol":"smtp",
  "bind":{"[::]:587":true},"useTls":true,"implicitTls":false}}},"0"]]'
```

**Settings from the installation** (X-Forwarded-For, Kontext's network as an allowed IP, a ban
period of one day, German search, 16 concurrent JMAP requests, Stalwart's RSVP page off, sign-in
on 587 only after STARTTLS; Kontext as OAuth client and directory queries are set up by the setup
command below):

```bash
/root/stalwart-api.sh '[
 ["x:Http/set",{"update":{"singleton":{"clientIpSource":"xForwardedFor","forwardedHops":1}}},"0"],
 ["x:AllowedIp/set",{"create":{"k":{"address":"10.89.250.0/24","reason":"Kontext"}}},"1"],
 ["x:Security/set",{"update":{"singleton":{"authBanPeriod":86400000,"scanBanPeriod":86400000,
   "abuseBanPeriod":86400000,"loiterBanPeriod":86400000}}},"2"],
 ["x:Search/set",{"update":{"singleton":{"defaultLanguage":"de-DE"}}},"3"],
 ["x:Jmap/set",{"update":{"singleton":{"maxConcurrentRequests":16}}},"4"],
 ["x:CalendarScheduling/set",{"update":{"singleton":{"httpRsvpEnable":false}}},"5"],
 ["x:MtaStageAuth/set",{"update":{"singleton":{"saslMechanisms":{"match":{"0":{
   "if":"local_port != 25 && is_tls","then":"[plain, login, oauthbearer, xoauth2]"}},
   "else":"false"}}}},"6"],
 ["x:Action/set",{"create":{"r":{"@type":"ReloadSettings"}}},"7"]]'
```

- `httpRsvpEnable`: otherwise Stalwart's invitation mails have *Yes/No/Maybe* buttons pointing to
  `https://mail.firma.de/calendar/rsvp` – Caddy answers there, not Stalwart, and the click ends
  in a TLS error. Kontext sends invitations itself, with buttons pointing to its own page
  (see [Invitations](architecture.md#einladungen)); Stalwart's mails only come when a phone or a
  mail program invites over CalDAV.
- `saslMechanisms`: Stalwart's default has a second rule that offers `oauthbearer` and `xoauth2`
  on 587 even **before** STARTTLS (an external scan reports it). Without it, 587 offers no `AUTH`
  at all in plain text, and after STARTTLS all four as before. Check:
  `printf 'EHLO test\r\nQUIT\r\n' | nc mail.firma.de 587 | grep -i auth` prints nothing.
  `ReloadSettings` loads this without a restart.

With `clientIpSource`, Stalwart expects the header on every HTTP request that doesn't come from
`127.0.0.1`; Kontext talks to it
directly, without it, and every request writes `X-Forwarded-For header is missing` to the log
(Stalwart then takes the connection's address, `crates/http/src/request.rs`). Take the message
out of the log (id from `x:Tracer/get`) – it only takes effect after a restart:

```bash
/root/stalwart-api.sh '[["x:Tracer/set",{"update":{"<tracer-id>":{"events":{"http.x-forwarded-missing":true}}}},"0"]]'
systemctl restart stalwart
```

**Kontext as OAuth client, directory queries, company admin.** All of this is set up by the
[setup command](installation.md#einrichtungsbefehl) in the Kontext container: the OAuth client
`kontext` with the scope `full`, directory queries, the role `Kontext-Server`, the account
`kontext-server@firma.de` and its API key. Here it takes the admin login from
`/root/.stalwart-admin` (`-e STALWART_ADMIN` passes the variable on without writing it into the
command line); the line `STALWART_ADMIN_KEY=…` it prints goes into `deploy/kontext.env`. Run it
again after every update; it only adds what is missing:

```bash
STALWART_ADMIN="$(cat /root/.stalwart-admin)" podman exec -e STALWART_ADMIN kontext bun server/setup-stalwart.ts
nano /opt/kontext/deploy/kontext.env && systemctl restart kontext
```

By hand it goes like this: the OAuth client and directory queries as in
[Setting up Stalwart](installation.md#3-stalwart-einrichten), steps 12–13, as
`x:OAuthClient/set` (`clientId`, `redirectUris`, `scopes: {"full": true}`) and `x:Sharing/set`
(`allowDirectoryQueries`, then `ReloadSettings`). Then a role `Kontext-Server` (inherits *User*,
id `b`), the account `kontext-server@firma.de` with it and a random password; put the id of the
new role from the first answer into the account:

```bash
PW=$(openssl rand -hex 24); echo "kontext-server@firma.de:$PW" > /root/.stalwart-kontext-server
chmod 600 /root/.stalwart-kontext-server
/root/stalwart-api.sh '[["x:Role/set",{"create":{"ks":{"description":"Kontext-Server","roleIds":{"b":true},
  "enabledPermissions":{"sysAccountGet":true,"sysAccountQuery":true,"sysAccountCreate":true,
  "sysAccountUpdate":true,"sysRoleGet":true,"sysRoleCreate":true,"sysDomainGet":true,
  "sysAuthenticationGet":true,"sysIndexQueueStatusGet":true,"impersonate":true}}}},"0"]]'
/root/stalwart-api.sh '[["x:Account/set",{"create":{"a":{"@type":"User","name":"kontext-server",
  "domainId":"<domain-id>","roles":{"@type":"Custom","roleIds":{"<rollen-id>":true}},
  "credentials":{"0":{"@type":"Password","secret":"'"$PW"'"}}}}},"0"]]'
```

The account creates the API key for itself; it appears once in the answer (`secret`, starts with
`API_`) and goes into `deploy/kontext.env` as `STALWART_ADMIN_KEY`:

```bash
curl -s -u "$(cat /root/.stalwart-kontext-server)" http://127.0.0.1:8080/jmap/ -H 'content-type: application/json' \
  -d '{"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],"methodCalls":[["x:ApiKey/set",
  {"create":{"k":{"description":"Kontext","permissions":{"@type":"Inherit"}}}},"0"]]}'
nano /opt/kontext/deploy/kontext.env && systemctl restart kontext
```

**The boss's account.** Kontext creates the role `Firmenverwaltung (Kontext)` the first time the
company admin is opened, only under this name (`server/company/management.ts`); it can just as
well be created beforehand. The account gets *User* (`b`) and this role, plus an alias if wanted
(`vorname.nachname@`, it lands in the same mailbox). After that the boss creates all other
employees and shared mailboxes **in Kontext**: in doing so, Kontext also shares the calendars as
"Availability only" with the colleagues (`newcomerPatches` in `server/company/availability.ts`).
If you create accounts by API, bypassing Kontext, catch up on that under *Settings → Company →
Employees → Calendar availability → Turn on for everyone*.

```bash
/root/stalwart-api.sh '[["x:Role/set",{"create":{"r":{"description":"Firmenverwaltung (Kontext)"}}},"0"]]'
/root/stalwart-api.sh '[["x:Account/set",{"create":{"c":{"@type":"User","name":"chef","domainId":"<domain-id>",
  "roles":{"@type":"Custom","roleIds":{"b":true,"<firmenrollen-id>":true}},
  "aliases":{"0":{"enable":true,"name":"vorname.nachname","domainId":"<domain-id>"}},
  "credentials":{"0":{"@type":"Password","secret":"<startpasswort>"}}}}},"0"]]'
```

## 11. Backup to Cloudflare R2 { #11-backup-auf-cloudflare-r2 }

As in [Backups](installation.md#5-backups): an R2 bucket with location EU, an R2 API token
(*Object Read & Write*, only this bucket, IP filter with the server's IPv4 **and** IPv6 network).
The settings for Quadlet go in `deploy/backup.env`, the restic password random:

```bash
cd /opt/kontext/deploy && umask 077
printf '%s\n' "KONTEXT_DOMAIN=kontext.firma.de" \
  "RESTIC_REPOSITORY=s3:https://<konto-id>.eu.r2.cloudflarestorage.com/<bucket>" \
  "RESTIC_PASSWORD=$(openssl rand -base64 36)" \
  "AWS_ACCESS_KEY_ID=<access-key-id>" "AWS_SECRET_ACCESS_KEY=<secret-access-key>" > backup.env
apt-get install -y restic
./backup.sh                                   # first backup, creates the repository
./backup-control.sh install                   # units for the nightly backup
systemctl enable --now kontext-backup.timer kontext-backup-control.path
```

If you have been starting the backup with cron so far, remove that entry once the timer runs:
`crontab -l | grep -v 'deploy/backup.sh' | crontab -`. After that, the company admin shows the
target, the last run and the storage under *Backup*; the time of day and "Back up now" are set
from there.

**Store the restic password** (`grep RESTIC_PASSWORD backup.env`) outside the server as well,
in a password manager for instance: without it the backup can't be read once the server is gone.

## 12. Move the mail over { #12-mail-umstellen }

Last, the domain's mail comes onto the server. First create the addresses that have been
receiving mail so far: with **Cloudflare Email Routing** they are under *Routing rules* (single
addresses and a catch-all). Single addresses become aliases of an account, a catch-all becomes
the domain's `catchAllAddress`:

```bash
/root/stalwart-api.sh '[
 ["x:Account/set",{"update":{"<konto-id>":{"aliases":{"0":{"enable":true,"name":"info","domainId":"<domain-id>"}}}}},"0"],
 ["x:Domain/set",{"update":{"<domain-id>":{"catchAllAddress":"chef@firma.de"}}},"1"]]'
```

(`aliases` replaces the list: include the existing aliases.)

Then in Cloudflare under *Email → Email Routing → Settings*, at the very bottom, **Disable Email
Routing**; Cloudflare removes its MX, SPF and DKIM records as it does so. Website records stay.
Right after that, set your own (until then there is no MX; sending servers try again later):

| Type | Name | Value |
| --- | --- | --- |
| MX | `firma.de` | `10 mail.firma.de` |
| TXT | `firma.de` | `v=spf1 mx -all` |
| TXT | `mail.firma.de` | `v=spf1 a -all` |
| TXT | `_dmarc.firma.de` | `v=DMARC1; p=none; rua=mailto:postmaster@firma.de` |
| TXT | `_mta-sts.firma.de` | `v=STSv1; id=…` (from Stalwart, `x:Domain/get` → `dnsZoneFile`) |
| TXT | `_smtp._tls.firma.de` | `v=TLSRPTv1; rua=mailto:postmaster@firma.de` |

Stalwart has already set the DKIM records (step 10). Stalwart suggests DMARC with `p=reject`
straight away; start with `p=none` and move to `quarantine` after a few weeks without failure
reports. The records for autoconfig and SRV (`autoconfig.`, `_imaps._tcp` …), which Stalwart
also suggests, point to `mail.firma.de:443` – Caddy answers there, not Stalwart: leave them out.

Check, then send a mail in from outside and one back (in the original at the recipient: SPF,
DKIM and DMARC *pass*):

```bash
dig +short MX firma.de @1.1.1.1
echo QUIT | openssl s_client -starttls smtp -connect mail.firma.de:25 -verify_return_error | grep -E "subject=|Verify"
```

!!! warning "Blocklists"
    VPS providers hand IP addresses out again; the new one may be on a blocklist because of an
    earlier tenant (with the first server: Spamhaus CSS). GMX, WEB.DE, T-Online and many company
    servers reject mail from there, Gmail sorts it into spam. Check before switching (through the
    provider's resolver; Spamhaus doesn't answer public ones like 1.1.1.1):

    ```bash
    R=10.113.0.203   # the IP reversed, for 203.0.113.10
    for bl in zen.spamhaus.org b.barracudacentral.org bl.spamcop.net bl.mailspike.net; do
      echo "$bl: $(dig +short $R.$bl | head -1)"; done
    ```

    Empty means not listed. At Spamhaus, check the IP on *check.spamhaus.org* and request the
    removal – only once reverse DNS and SPF/DKIM/DMARC are right:

    - Spamhaus accepts **no freemail address** (Gmail, GMX …), only one on your own domain. So
      the confirmation only arrives once the mail already runs on the server – which is why the
      removal comes **after** the switch.
    - *Most recently seen HELO values* shows how the IP last identified itself. Foreign names
      from before your own start are the previous tenant. **Don't** follow the advice to set the
      PTR to that name: PTR, HELO and A record stay `mail.firma.de`.
    - In the form, *Immediate removal*; as the reason: new tenant since <date>, the HELOs seen
      belong to the previous tenant, own mail server with PTR/HELO `mail.firma.de`, SPF, DKIM,
      DMARC, no open relay. Kind of mail "Personal and business correspondence", volume per
      week, *new IP: Yes*. Then the link in the confirmation mail; someone reviews the case and
      gets back to you by mail.

    If it can't be removed: ask the provider for another IP, or send outgoing mail through a
    sending service (smarthost).

    A new server's first mails often land in spam at Gmail, even without a blocklist: mark them
    "Not spam" at the recipient, and add the domain to Google Postmaster Tools. Microsoft
    (Outlook, Hotmail, Microsoft 365) keeps its own block without a public list; if sending
    there gets a rejection with `S3140`, have the IP unblocked at *sender.office.com*. All public
    lists at once: *mxtoolbox.com/blacklists.aspx*.

**A folder for reports.** From now on, DMARC and TLS reports (Google, Microsoft …) arrive at
`postmaster@` daily, and bounces of Stalwart's own DMARC reports to other domains arrive at
`noreply-dmarc@`. Both addresses land in the boss's inbox through the `catchAllAddress`. In
Kontext, create a folder *Berichte* (reports) in his mailbox and a rule: *Recipient contains*
`postmaster@firma.de` **or** `noreply-dmarc@firma.de` → into *Berichte*, applied to existing mail
too. Real bounces of your own mails go to your own address and stay in the inbox. Whether Gmail
accepts your mails is in the attachment of Google's reports (a ZIP with XML): per sender IP
`dkim`, `spf` and `result` – all `pass` means a spam folder at the recipient is not down to the
setup but to the new IP's missing reputation.

A test mail dropped in on port 25 on the server itself is no good for checking: without DKIM,
Stalwart's spam filter rates it as spam, and spam goes into the spam folder before the rules run
(`server/rules/script.ts`). The next real reports show whether the rule works.

## 13. Keep the credentials safe { #13-zugangsdaten-sichern }

What belongs in a password manager outside the server – not in a text file:

| Entry | What for | On the server |
| --- | --- | --- |
| **Restic password** | Without it the backup can't be read | `deploy/backup.env` |
| **Storage key** (`STALWART_BLOB_KEY`) | Without it Stalwart can't read the mails, not even from the backup | `deploy/stalwart.env` |
| **Stalwart admin** (`admin@firma.de`) | Emergency access to Stalwart's management | `/root/.stalwart-admin` |
| **The boss's account** | Sign-in to Kontext and mail programs (after changing it, the new one) | – |
| **SSH key, access to the provider** | Server and panel | – |
| `deploy/kontext.env`, `deploy/backup.env` (as a secure note) | Faster restore; the backup doesn't include them | `deploy/` |

The temporary password from Stalwart's log (user `admin`) no longer works after the initial
setup. Not needed, because they can be created again at any time: the account `kontext-server@`
and its API key, the Cloudflare token, the R2 keys. View them on the server, for instance
`cat /root/.stalwart-admin`; delete initial passwords there afterwards.

## 14. Automatic updates { #14-automatische-updates }

Debian closes security holes on its own – important for a server with port 25 open. Daily, and
when an update (the kernel, say) needs it, a reboot at 4:30, after the backup at 3:00; the
services start again on their own afterwards (Quadlet):

```bash
apt-get install -y unattended-upgrades
printf '%s\n' 'APT::Periodic::Update-Package-Lists "1";' 'APT::Periodic::Unattended-Upgrade "1";' \
  > /etc/apt/apt.conf.d/20auto-upgrades
printf '%s\n' 'Unattended-Upgrade::Automatic-Reboot "true";' \
  'Unattended-Upgrade::Automatic-Reboot-Time "04:30";' \
  'Unattended-Upgrade::Remove-Unused-Dependencies "true";' > /etc/apt/apt.conf.d/52kontext-unattended
unattended-upgrade --dry-run -v | grep -i "allowed origins"
```

This only covers Debian (kernel, SSH, Podman …), **not the containers**: their versions are fixed
in the Quadlet files and only change by hand, see [Updates](installation.md#6-updates).
