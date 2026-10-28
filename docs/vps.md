---
description: >-
  Einen neuen VPS für Kontext einrichten: SSH nur mit Schlüssel, Mail-Sperre und Reverse DNS beim
  Anbieter, Podman und Quadlet, DNS bei Cloudflare, Firewall mit nftables, Stalwart ohne
  Oberfläche, Backup auf Cloudflare R2, Mail umstellen, automatische Updates.
---

# VPS einrichten – erste Schritte

Bevor Kontext auf einen neuen Server kommt ([Installation](installation.md)), wird der Zugang
abgesichert: Anmeldung nur noch mit SSH-Schlüssel, kein Passwort-Login mehr. Die Beispiele
gehen von einem frischen Debian/Ubuntu-VPS aus (etwa bei netcup) mit der IP `203.0.113.10`.

Was wo passiert:

| Schritt                         | Wo                     |
| ------------------------------- | ---------------------- |
| 1. Root-Passwort setzen         | Kundenbereich des Anbieters |
| 2. Schlüssel auf den Server     | eigener Rechner        |
| 3. Kurzname in `~/.ssh/config`  | eigener Rechner        |
| 4. Passwort-Login abschalten    | Server                 |
| 5. Mail-Sperre aufheben         | Kundenbereich des Anbieters |
| 6. Podman installieren          | Server                 |
| 7. DNS bei Cloudflare           | Cloudflare und Server  |
| 8. Firewall                     | Server                 |
| 9. Kontext mit Quadlet starten  | Server                 |
| 10. Stalwart ohne Oberfläche einrichten | Server         |
| 11. Backup auf Cloudflare R2    | Cloudflare und Server  |
| 12. Mail umstellen              | Cloudflare und Server  |
| 13. Zugangsdaten sichern        | Passwortmanager        |
| 14. Automatische Updates        | Server                 |

## 1. Root-Passwort setzen

Ein neuer VPS lässt sich oft noch nicht anmelden: `ssh root@…` endet mit **Permission denied**.
Dann ist für `root` noch kein (oder ein unbekanntes) Passwort gesetzt. Bei netcup im
Server Control Panel unter *Server → Zugang* ein neues Root-Passwort setzen, danach geht es:

```bash
ssh root@203.0.113.10
```

Klappt es immer noch nicht, zeigt `ssh -v root@203.0.113.10` in der Zeile
`Authentications that can continue:`, was der Server erlaubt. Steht dort nur `publickey`, ist
der Passwort-Login schon aus. Als Notzugang bleibt die Konsole des Anbieters (bei netcup
*Bildschirm*); sie ist ein lokaler Login und braucht kein SSH.

## 2. Schlüssel auf den Server

Auf dem **eigenen Rechner**. Noch keinen Schlüssel? Einen anlegen:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/privat_ed25519
```

Den öffentlichen Teil auf den Server kopieren – `ssh-copy-id` fragt ein letztes Mal nach dem
Root-Passwort und hängt den Schlüssel an `~/.ssh/authorized_keys` auf dem Server an:

```bash
ssh-copy-id -i ~/.ssh/privat_ed25519.pub root@203.0.113.10
```

Ohne `ssh-copy-id` (Windows, PowerShell):

```powershell
type $env:USERPROFILE\.ssh\privat_ed25519.pub | ssh root@203.0.113.10 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

!!! tip "Keybund"
    Mit [Keybund](https://github.com/firsttris/keybund) geht das auch ohne Terminal: Server
    anlegen, Schlüssel zuordnen, **Add key**, dann **Test**.

## 3. Kurzname in `~/.ssh/config`

Wer mehrere Schlüssel hat, gibt den richtigen fest vor – sonst probiert `ssh` alle durch und der
Server bricht mit *Too many authentication failures* ab. Auf dem **eigenen Rechner** in
`~/.ssh/config`:

```
Host kunde-vps
    HostName 203.0.113.10
    User root
    IdentityFile ~/.ssh/privat_ed25519
    IdentitiesOnly yes
```

Danach reicht `ssh kunde-vps`. Prüfen, dass es **ohne Passwortabfrage** reinkommt, bevor es
weitergeht.

## 4. Passwort-Login abschalten

Auf dem **Server**. Die angemeldete Sitzung offen lassen, bis eine neue Anmeldung mit Schlüssel
geklappt hat.

Eine eigene Datei unter `sshd_config.d/` anlegen (eine Zeile, zum Kopieren):

```bash
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\nPermitRootLogin prohibit-password\n' > /etc/ssh/sshd_config.d/00-keyonly.conf
```

Das `00-` im Namen ist wichtig: Bei `sshd` gilt der **erste** gefundene Wert, und viele Images
bringen eine `50-cloud-init.conf` mit `PasswordAuthentication yes` mit, die sonst gewinnen würde.

Prüfen, neu starten und kontrollieren:

```bash
sshd -t && systemctl restart ssh && sshd -T | grep -Ei 'passwordauth|permitroot'
```

Erwartet:

```
permitrootlogin without-password
passwordauthentication no
```

Zum Schluss aus einem **zweiten Terminal** `ssh kunde-vps` – kommt die Anmeldung durch, ist der
Server nur noch mit Schlüssel erreichbar.

!!! note "Ausgesperrt?"
    Über die Konsole des Anbieters mit dem Root-Passwort anmelden,
    `rm /etc/ssh/sshd_config.d/00-keyonly.conf && systemctl restart ssh`, Schritt 2 wiederholen.

## 5. Mail-Sperre aufheben

Ein neuer netcup-VPS darf keine Mails verschicken: Die Firewall im Server Control Panel bringt die
Regelgruppe **„netcup Mail block“** mit, die ausgehend die Ports **25, 465 und 587** verwirft.
Kontext braucht alle drei: Stalwart stellt über 25 an andere Mailserver zu, und verbundene
externe Postfächer (Gmail, GMX …) versenden über 465 oder 587 (`server/external/smtp.ts`).

Im Server Control Panel unter *Server → Firewall* die Gruppe **„netcup Mail block“ löschen** und
speichern. Eingehend lässt die Firewall dort alles durch; abgeschottet wird auf dem Server selbst.

Prüfen auf dem **Server** (kann ein paar Minuten dauern, bis die Freigabe greift):

```bash
timeout 5 bash -c 'echo > /dev/tcp/gmail-smtp-in.l.google.com/25' && echo offen || echo gesperrt
```

Den **Reverse-DNS** (PTR) setzt man bei netcup nicht im Server Control Panel, sondern im
**Customer Control Panel** unter *Produkte → (der Server) → rDNS*: bei der IPv4-Adresse als
Hostname den Namen des Mailservers (`mail.firma.de`), *Hostname ändern*. Ohne passenden PTR landen
Mails schnell im Spam. IPv6 braucht keinen Eintrag: Die Container haben nur IPv4, Stalwart
verschickt über die IPv4-Adresse. Prüfen: `dig +short -x 203.0.113.10`.

## 6. Podman installieren

Kontext läuft mit Podman und Quadlet: Jeder Dienst ist eine systemd-Unit, startet mit dem Server
und braucht keinen Daemon. Die Dateien liegen in `deploy/quadlet/`. Auf dem **Server**:

```bash
apt-get update && apt-get install -y git podman
git clone https://github.com/firsttris/kontext /opt/kontext
```

Debian 13 bringt Podman 5.4 mit, Quadlet ist dabei. Docker nicht zusätzlich installieren: Es legt
eigene Firewall-Regeln an, die sich mit Podmans Netz in die Quere kommen. War es schon drauf, mit
`apt-get purge docker-ce docker-ce-cli containerd.io docker-compose-plugin` entfernen und die
übrig gebliebenen Tabellen löschen (`nft list tables` zeigt sie, `nft delete table ip nat` usw.).

## 7. DNS bei Cloudflare

Liegt die Domain bei Cloudflare, bekommt der Server einen **API-Token**: Stalwart holt damit sein
Zertifikat für `mail.firma.de` (ACME DNS-01, siehe [Installation](installation.md#3-stalwart-einrichten)),
und die Einträge lassen sich vom Server aus setzen.

Im Cloudflare-Dashboard unter *Profil → API Tokens → Create Token* die Vorlage **„Edit zone DNS“**:

- *Zone Resources*: nur die eine Zone (`firma.de`), nicht alle Zonen des Kontos;
- *Client IP Address Filtering*: die IPv4-Adresse des Servers und sein IPv6-Netz (`…::/64`) –
  dann taugt der Token nirgends sonst etwas;
- *TTL*: kein Ablauf, Stalwart erneuert das Zertifikat alle paar Wochen.

Den Token auf dem Server nur für root lesbar ablegen:

```bash
umask 077 && nano /root/.cloudflare-token
```

Prüfen und die vorhandenen Einträge ansehen:

```bash
T=$(cat /root/.cloudflare-token)
curl -s -H "Authorization: Bearer $T" "https://api.cloudflare.com/client/v4/zones?name=firma.de" \
  | grep -o '"id":"[a-f0-9]\{32\}"' | head -1        # die Zonen-ID
curl -s -H "Authorization: Bearer $T" "https://api.cloudflare.com/client/v4/zones/<zonen-id>/dns_records"
```

Läuft die Mail der Domain bisher über **Cloudflare Email Routing** (MX auf
`route1.mx.cloudflare.net` …), bleibt das bis zum Schluss so: Erst wenn der Server läuft, wird
Email Routing abgeschaltet und der MX umgestellt.

Für den Server zuerst nur die A-Einträge, alle **DNS only** (graue Wolke), auf die IP des Servers:
`kontext`, `mail`, `dokumente`, `mta-sts` und `openpgpkey`. Die Website und die bisherige Mail
bleiben davon unberührt.

Prüfen (nach ein paar Minuten bei allen Resolvern; der des Anbieters merkt sich ein „gibt es
nicht“ von vorher etwas länger):

```bash
apt-get install -y bind9-dnsutils
for n in kontext mail dokumente mta-sts openpgpkey; do dig +short $n.firma.de @1.1.1.1; done
```

Die Einträge **vor** dem ersten Start anlegen und warten, bis auch der Server selbst sie auflöst
(`getent hosts kontext.firma.de`): Hat er vorher schon gefragt, merkt sich der Resolver des
Anbieters das „gibt es nicht“ bis zu 30 Minuten (bei Cloudflare), und Schreibzeug findet Kontext
beim Start nicht.

## 8. Firewall

Von außen soll den Server selbst nur SSH erreichen. Die Ports der Container (Web, Mail, Anrufe)
leitet Podman weiter (netavark: DNAT, dann *forward*); sie laufen nicht durch die Eingangskette
des Servers und brauchen dort keine Regel. **Kein ufw**: Es verwirft weitergeleitete Pakete und
damit die Container-Ports. Stattdessen nftables, in `/etc/nftables.conf`:

```
#!/usr/sbin/nft -f
# Kein "flush ruleset": das würfe auch Podmans Regeln weg.
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
		# Container fragen Podmans DNS (aardvark) am Gateway der Bridge
		iifname "podman*" accept
	}
}
```

```bash
nft -c -f /etc/nftables.conf && nft -f /etc/nftables.conf && systemctl enable --now nftables
```

Die angemeldete SSH-Sitzung offen lassen und aus einem zweiten Terminal prüfen, dass `ssh`
weiter geht.

## 9. Kontext mit Quadlet starten

Jeder Dienst bekommt nur seine eigenen Einstellungen, in einer Datei unter `/opt/kontext/deploy/`,
nur für root lesbar (sie stehen in `.gitignore`). Die Geheimnisse für LiveKit und Schreibzeug als
hex, weil das LiveKit-Geheimnis auch in YAML steht:

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
umask 022
```

`SIP_CONFIG_BODY` steht in einer Zeile (YAML in Klammerschreibweise): Eine Env-Datei kennt keine
Werte über mehrere Zeilen.

Die Quadlet-Dateien kopieren und Domain und Let's-Encrypt-Adresse eintragen (Quadlet setzt keine
Variablen ein) – in den `.container`-Dateien und in den eben geschriebenen `kontext.env` und
`schreibzeug.env`, die die Beispiel-Domain auch enthalten. Die Telefonbox (`kontext-box.container`)
läuft im Büro, nicht hier:

```bash
cp quadlet/*.network quadlet/*.container /etc/containers/systemd/
rm /etc/containers/systemd/kontext-box.container
sed -i 's/firma\.de/meinefirma.de/g' kontext.env schreibzeug.env
cd /etc/containers/systemd
sed -i 's/firma\.de/meinefirma.de/g' *.container
sed -i 's/^Environment=ACME_EMAIL=.*/Environment=ACME_EMAIL=admin@meinefirma.de/' caddy.container
grep -h 'firma\.de' *.container /opt/kontext/deploy/*.env   # jede Zeile nennt jetzt die eigene Domain
systemctl daemon-reload
```

Jedes `sed` nur einmal laufen lassen: `meinefirma.de` enthält selbst `firma.de`.

Images laden und starten. Mit dem Server starten sie danach von selbst (`[Install]` in jeder
Datei):

```bash
for i in $(grep -h '^Image=' *.container | cut -d= -f2); do podman pull $i; done
systemctl start stalwart redis livekit livekit-sip kontext schreibzeug caddy
podman ps
```

Caddy holt die Zertifikate gleich beim Start (`podman logs caddy`). Findet Schreibzeug Kontext
beim Start nicht (DNS noch nicht da, Kontext startet noch), steht in seinem Log
`Discovery fetch failed … Provider skipped` und in Kontexts `Schreibzeug antwortet nicht`: harmlos,
Better Auth fragt beim ersten „Anmelden mit Kontext“ erneut (`retryDiscovery` in
`better-auth/plugins/generic-oauth`), ein Neustart ist nicht nötig. Im Log von Stalwart steht das
vorläufige Admin-Passwort (`podman logs stalwart`). Stalwarts Verwaltung ist nur auf dem Server
selbst erreichbar; vom eigenen Rechner über einen Tunnel, dann `http://localhost:8080` im Browser:

```bash
ssh -L 8080:127.0.0.1:8080 kunde-vps
```

Danach weiter mit [Stalwart einrichten](installation.md#3-stalwart-einrichten) – in der
Oberfläche oder wie unten direkt auf dem Server.

## 10. Stalwart ohne Oberfläche einrichten

Alles aus [Stalwart einrichten](installation.md#3-stalwart-einrichten) geht auch über Stalwarts
Verwaltungs-API (JMAP, `x:<Objekt>/get|set`, die Objekte in
`crates/registry/src/schema/structs.rs` von Stalwart), auf dem Server gegen `127.0.0.1:8080`.

!!! danger "Stalwart schreibt sonst selbst ins DNS"
    Mit Cloudflare-Token bei der Ersteinrichtung legt Stalwart **MX, SPF (`mx -all`) und DMARC
    (`p=reject`)** an und stellt damit die Mail der Domain sofort auf den neuen Server um – auch
    wenn sie noch woanders läuft. Darum die Ersteinrichtung ohne DNS (`Manual`) und danach den
    Token nur für das Zertifikat und die DKIM-Schlüssel.

Ein kleiner Helfer (die Zugangsdaten liegen in `/root/.stalwart-admin` als `name:passwort`):

```bash
cat > /root/stalwart-api.sh <<'SH'
#!/bin/sh
exec curl -s -u "$(cat /root/.stalwart-admin)" http://127.0.0.1:8080/jmap/ -H 'content-type: application/json' \
  -d "{\"using\":[\"urn:ietf:params:jmap:core\",\"urn:stalwart:jmap\"],\"methodCalls\":$1}"
SH
chmod 700 /root/stalwart-api.sh
```

**Ersteinrichtung.** Mit dem vorläufigen Passwort aus `podman logs stalwart` (Benutzer `admin`;
nach jedem Neustart vor der Einrichtung ein neues). Ohne Zertifikat und ohne DNS; die
DKIM-Schlüssel erzeugt Stalwart, das Log geht nach `podman logs`:

```bash
curl -s -u 'admin:<vorläufiges-passwort>' http://127.0.0.1:8080/jmap/ -H 'content-type: application/json' -d '{
  "using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],
  "methodCalls":[["x:Bootstrap/set",{"update":{"singleton":{
    "serverHostname":"mail.firma.de","defaultDomain":"firma.de",
    "requestTlsCertificate":false,"generateDkimKeys":true,"dnsServer":{"@type":"Manual"},
    "tracer":{"@type":"Stdout","ansi":false,"multiline":false,"enable":true,"level":"info",
              "lossy":false,"buffered":true,"events":{},"eventsPolicy":"exclude"}}}},"0"]]}'
```

Die Antwort enthält den festen Admin (`admin@firma.de`) und sein Passwort: als
`admin@firma.de:<passwort>` nach `/root/.stalwart-admin` (`chmod 600`), dann
`systemctl restart stalwart`. Erst danach laufen die Mail-Ports.

**Zertifikat für `mail.firma.de`** per DNS-01 über Cloudflare (Port 443 hat Caddy). Stalwart
holt es nur mit DNS-Verwaltung; `publishRecords` braucht mindestens einen Typ, und `dkim` ist
harmlos (eigene Namen `v1-…._domainkey`, fremde DKIM-Einträge bleiben). Die Ids aus den Antworten
von `x:Domain/get`, `x:DnsServer/get`, `x:AcmeProvider/get` einsetzen:

```bash
/root/stalwart-api.sh '[
 ["x:DnsServer/set",{"create":{"cf":{"@type":"Cloudflare","secret":{"@type":"Value","secret":"<cloudflare-token>"}}}},"0"],
 ["x:AcmeProvider/set",{"create":{"le":{"challengeType":"Dns01","contact":{"admin@firma.de":true},
   "directory":"https://acme-v02.api.letsencrypt.org/directory"}}},"1"]]'
/root/stalwart-api.sh '[["x:Domain/set",{"update":{"<domain-id>":{
   "certificateManagement":{"@type":"Automatic","acmeProviderId":"<acme-id>","subjectAlternativeNames":{"mail.firma.de":true}},
   "dnsManagement":{"@type":"Automatic","dnsServerId":"<dns-id>","origin":null,"publishRecords":{"dkim":true}}}}},"0"]]'
```

Nach ein bis zwei Minuten steht im Log `ACME order completed`; Stalwart erneuert selbst.

**Port 587.** Stalwarts Standard-Listener haben 465, aber nicht 587 (STARTTLS), den viele
Mailprogramme nehmen:

```bash
/root/stalwart-api.sh '[["x:NetworkListener/set",{"create":{"sub":{"name":"submission","protocol":"smtp",
  "bind":{"[::]:587":true},"useTls":true,"tlsImplicit":false}}},"0"]]'
```

**Einstellungen aus der Installation** (X-Forwarded-For, Kontexts Netz als erlaubte IP,
Sperrdauer ein Tag, deutsche Suche, 16 gleichzeitige JMAP-Anfragen, Stalwarts RSVP-Seite aus,
Anmeldung auf 587 nur nach STARTTLS):

```bash
/root/stalwart-api.sh '[
 ["x:Http/set",{"update":{"singleton":{"useXForwarded":true}}},"0"],
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

- `httpRsvpEnable`: Stalwarts Einladungsmails haben sonst Knöpfe *Yes/No/Maybe* auf
  `https://mail.firma.de/calendar/rsvp` – dort antwortet Caddy, nicht Stalwart, der Klick endet
  in einem TLS-Fehler. Einladungen verschickt Kontext selbst, mit Knöpfen auf seine eigene Seite
  (siehe [Einladungen](architecture.md#einladungen)); Stalwarts Mails gibt es nur noch, wenn ein
  Handy oder Mailprogramm über CalDAV einlädt.
- `saslMechanisms`: Stalwarts Standard hat eine zweite Regel, die auf 587 `oauthbearer` und
  `xoauth2` schon **vor** STARTTLS anbietet (ein externer Scan meldet das). Ohne sie bietet 587
  im Klartext gar kein `AUTH` an, nach STARTTLS alle vier wie bisher. Prüfen:
  `printf 'EHLO test\r\nQUIT\r\n' | nc mail.firma.de 587 | grep -i auth` gibt nichts aus.
  `ReloadSettings` lädt das ohne Neustart.

Mit `useXForwarded` erwartet Stalwart den Header bei jeder HTTP-Anfrage; Kontext spricht es
direkt an, ohne ihn, und jede Anfrage schreibt `X-Forwarded-For header is missing` ins Log
(Stalwart nimmt dann die Adresse der Verbindung, `crates/http/src/request.rs`). Die Meldung aus
dem Log nehmen (Id aus `x:Tracer/get`) – wirkt erst nach einem Neustart:

```bash
/root/stalwart-api.sh '[["x:Tracer/set",{"update":{"<tracer-id>":{"events":{"http.x-forwarded-missing":true}}}},"0"]]'
systemctl restart stalwart
```

**Firmenverwaltung.** Rolle `Kontext-Server` (erbt *User*, Id `b`), das Konto
`kontext-server@firma.de` mit ihr und einem Zufallspasswort; die Id der neuen Rolle aus der
ersten Antwort beim Konto einsetzen:

```bash
PW=$(openssl rand -hex 24); echo "kontext-server@firma.de:$PW" > /root/.stalwart-kontext-server
chmod 600 /root/.stalwart-kontext-server
/root/stalwart-api.sh '[["x:Role/set",{"create":{"ks":{"description":"Kontext-Server","roleIds":{"b":true},
  "enabledPermissions":{"sysAccountGet":true,"sysAccountQuery":true,"sysAccountCreate":true,
  "sysAccountUpdate":true,"sysRoleGet":true,"sysRoleCreate":true,"sysDomainGet":true,
  "sysAuthenticationGet":true,"impersonate":true}}}},"0"]]'
/root/stalwart-api.sh '[["x:Account/set",{"create":{"a":{"@type":"User","name":"kontext-server",
  "domainId":"<domain-id>","roles":{"@type":"Custom","roleIds":{"<rollen-id>":true}},
  "credentials":{"0":{"@type":"Password","secret":"'"$PW"'"}}}}},"0"]]'
```

Den API-Schlüssel legt das Konto für sich selbst an; er steht einmal in der Antwort (`secret`,
beginnt mit `API_`) und kommt als `STALWART_ADMIN_KEY` in `deploy/kontext.env`:

```bash
curl -s -u "$(cat /root/.stalwart-kontext-server)" http://127.0.0.1:8080/jmap/ -H 'content-type: application/json' \
  -d '{"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],"methodCalls":[["x:ApiKey/set",
  {"create":{"k":{"description":"Kontext","permissions":{"@type":"Inherit"}}}},"0"]]}'
nano /opt/kontext/deploy/kontext.env && systemctl restart kontext
```

**Das Konto des Chefs.** Kontext legt die Rolle `Firmenverwaltung (Kontext)` beim ersten Aufruf
der Firmenverwaltung an, nur mit diesem Namen (`server/company/management.ts`); sie lässt sich
genauso vorher anlegen. Das Konto bekommt *User* (`b`) und diese Rolle, dazu auf Wunsch einen
Alias (`vorname.nachname@`, landet im selben Postfach). Danach legt der Chef alle weiteren
Mitarbeiter und gemeinsamen Postfächer **in Kontext** an: Kontext gibt dabei auch die Kalender als
„Nur Verfügbarkeit“ für die Kollegen frei (`newcomerPatches` in `server/company/availability.ts`).
Wer Konten an Kontext vorbei per API anlegt, holt das unter *Einstellungen → Firma → Mitarbeiter
→ Verfügbarkeit im Kalender → Für alle einschalten* nach.

```bash
/root/stalwart-api.sh '[["x:Role/set",{"create":{"r":{"description":"Firmenverwaltung (Kontext)"}}},"0"]]'
/root/stalwart-api.sh '[["x:Account/set",{"create":{"c":{"@type":"User","name":"chef","domainId":"<domain-id>",
  "roles":{"@type":"Custom","roleIds":{"b":true,"<firmenrollen-id>":true}},
  "aliases":{"0":{"enabled":true,"name":"vorname.nachname","domainId":"<domain-id>"}},
  "credentials":{"0":{"@type":"Password","secret":"<startpasswort>"}}}}},"0"]]'
```

## 11. Backup auf Cloudflare R2

Wie in [Backups](installation.md#5-backups): ein R2-Bucket mit Standort EU, ein R2-API-Token
(*Object Read & Write*, nur dieser Bucket, IP-Filter mit IPv4 **und** IPv6-Netz des Servers).
Die Einstellungen für Quadlet in `deploy/backup.env`, das Restic-Passwort zufällig:

```bash
cd /opt/kontext/deploy && umask 077
printf '%s\n' "KONTEXT_DOMAIN=kontext.firma.de" \
  "RESTIC_REPOSITORY=s3:https://<konto-id>.eu.r2.cloudflarestorage.com/<bucket>" \
  "RESTIC_PASSWORD=$(openssl rand -base64 36)" \
  "AWS_ACCESS_KEY_ID=<access-key-id>" "AWS_SECRET_ACCESS_KEY=<secret-access-key>" > backup.env
apt-get install -y restic
./backup.sh                                   # erste Sicherung, legt das Repository an
./backup-control.sh install                   # Units für die nächtliche Sicherung
systemctl enable --now kontext-backup.timer kontext-backup-control.path
```

Wer die Sicherung bisher per Cron startet, nimmt den Eintrag heraus, sobald der Timer läuft:
`crontab -l | grep -v 'deploy/backup.sh' | crontab -`. Danach zeigt die Firmenverwaltung unter
*Datensicherung* Ziel, letzten Lauf und Speicher; Uhrzeit und „Jetzt sichern“ gehen von dort.

**Das Restic-Passwort** (`grep RESTIC_PASSWORD backup.env`) zusätzlich außerhalb des Servers
ablegen, etwa im Passwortmanager: Ohne es ist das Backup nicht lesbar, wenn der Server weg ist.

## 12. Mail umstellen

Zuletzt kommt die Mail der Domain auf den Server. Vorher die Adressen anlegen, die bisher
ankamen: Bei **Cloudflare Email Routing** stehen sie unter *Routing-Regeln* (einzelne Adressen
und ein Catch-all). Einzelne Adressen werden Aliase eines Kontos, ein Catch-all wird zur
`catchAllAddress` der Domain:

```bash
/root/stalwart-api.sh '[
 ["x:Account/set",{"update":{"<konto-id>":{"aliases":{"0":{"enabled":true,"name":"info","domainId":"<domain-id>"}}}}},"0"],
 ["x:Domain/set",{"update":{"<domain-id>":{"catchAllAddress":"chef@firma.de"}}},"1"]]'
```

(`aliases` ersetzt die Liste: vorhandene Aliase mit angeben.)

Dann in Cloudflare unter *Email → Email Routing → Einstellungen* ganz unten **Email Routing
deaktivieren**; Cloudflare entfernt dabei seine MX-, SPF- und DKIM-Einträge. Website-Einträge
bleiben. Sofort danach die eigenen setzen (Bis dahin gibt es keinen MX; absendende Server
versuchen es später erneut):

| Typ | Name | Wert |
| --- | --- | --- |
| MX | `firma.de` | `10 mail.firma.de` |
| TXT | `firma.de` | `v=spf1 mx -all` |
| TXT | `mail.firma.de` | `v=spf1 a -all` |
| TXT | `_dmarc.firma.de` | `v=DMARC1; p=none; rua=mailto:postmaster@firma.de` |
| TXT | `_mta-sts.firma.de` | `v=STSv1; id=…` (aus Stalwart, `x:Domain/get` → `dnsZoneFile`) |
| TXT | `_smtp._tls.firma.de` | `v=TLSRPTv1; rua=mailto:postmaster@firma.de` |

Die DKIM-Einträge hat Stalwart schon gesetzt (Schritt 10). Stalwart schlägt DMARC gleich mit
`p=reject` vor; zum Start `p=none` und nach ein paar Wochen ohne Fehlberichte `quarantine`. Die
Einträge für Autoconfig und SRV (`autoconfig.`, `_imaps._tcp` …), die Stalwart ebenfalls vorschlägt,
zeigen auf `mail.firma.de:443` – dort antwortet Caddy, nicht Stalwart: weglassen.

Prüfen, dann eine Mail von außen hin und eine zurück (im Original beim Empfänger: SPF, DKIM und
DMARC *pass*):

```bash
dig +short MX firma.de @1.1.1.1
echo QUIT | openssl s_client -starttls smtp -connect mail.firma.de:25 -verify_return_error | grep -E "subject=|Verify"
```

!!! warning "Sperrlisten"
    VPS-Anbieter vergeben IP-Adressen neu; die neue kann von einem früheren Mieter auf einer
    Sperrliste stehen (beim ersten Server: Spamhaus CSS). GMX, WEB.DE, T-Online und viele
    Firmen-Server lehnen Mails von dort ab, Gmail sortiert sie in den Spam. Vor der Umstellung
    prüfen (über den Resolver des Anbieters; öffentliche wie 1.1.1.1 beantwortet Spamhaus nicht):

    ```bash
    R=10.113.0.203   # die IP rückwärts, für 203.0.113.10
    for bl in zen.spamhaus.org b.barracudacentral.org bl.spamcop.net bl.mailspike.net; do
      echo "$bl: $(dig +short $R.$bl | head -1)"; done
    ```

    Leer heißt nicht gelistet. Bei Spamhaus auf *check.spamhaus.org* die IP prüfen und die
    Austragung beantragen – erst wenn Reverse-DNS und SPF/DKIM/DMARC stimmen:

    - Spamhaus nimmt **keine Freemail-Adresse** (Gmail, GMX …) an, nur eine der eigenen Domain.
      Die Bestätigung kommt also erst an, wenn die Mail schon auf dem Server läuft – die Austragung
      kommt deshalb **nach** der Umstellung.
    - Unter *Most recently seen HELO values* steht, wie sich die IP zuletzt gemeldet hat. Fremde
      Namen vor dem eigenen Start sind der Vormieter. Die Empfehlung, den PTR auf diesen Namen zu
      setzen, **nicht** befolgen: PTR, HELO und A-Eintrag bleiben `mail.firma.de`.
    - Im Formular *Immediate removal*; als Begründung: neuer Mieter seit <Datum>, die gesehenen
      HELOs gehören dem Vormieter, eigener Mailserver mit PTR/HELO `mail.firma.de`, SPF, DKIM,
      DMARC, kein offenes Relay. Art der Mails „Personal and business correspondence“, Menge pro
      Woche, *new IP: Yes*. Dann den Link in der Bestätigungsmail; ein Bearbeiter prüft den Fall
      und meldet sich per Mail.

    Lässt sie sich nicht austragen: beim Anbieter eine andere IP erfragen oder ausgehend über einen
    Versanddienst (Smarthost) senden.

    Die ersten Mails eines neuen Servers landen bei Gmail oft im Spam, auch ohne Sperrliste:
    beim Empfänger „Kein Spam“, die Domain in den Google Postmaster Tools eintragen. Microsoft
    (Outlook, Hotmail, Microsoft 365) führt eine eigene Sperre ohne öffentliche Liste; kommt beim
    Senden dorthin eine Absage mit `S3140`, die IP unter *sender.office.com* freischalten lassen.
    Alle öffentlichen Listen auf einmal: *mxtoolbox.com/blacklists.aspx*.

## 13. Zugangsdaten sichern

Was außerhalb des Servers in einen Passwortmanager gehört – nicht in eine Textdatei:

| Eintrag | Wozu | Auf dem Server |
| --- | --- | --- |
| **Restic-Passwort** | Ohne es ist das Backup nicht lesbar | `deploy/backup.env` |
| **Stalwart-Admin** (`admin@firma.de`) | Notzugang zu Stalwarts Verwaltung | `/root/.stalwart-admin` |
| **Konto des Chefs** | Anmeldung in Kontext und Mailprogrammen (nach dem Ändern das neue) | – |
| **SSH-Schlüssel, Zugang zum Anbieter** | Server und Panel | – |
| `deploy/kontext.env`, `deploy/backup.env` (als sichere Notiz) | Schnellere Wiederherstellung; das Backup sichert sie nicht | `deploy/` |

Das vorläufige Passwort aus dem Log von Stalwart (Benutzer `admin`) gilt nach der Ersteinrichtung
nicht mehr. Nicht nötig, weil jederzeit neu zu erzeugen: das Konto `kontext-server@` und sein
API-Schlüssel, der Cloudflare-Token, die R2-Schlüssel. Ansehen auf dem Server, etwa
`cat /root/.stalwart-admin`; Startpasswörter danach dort löschen.

## 14. Automatische Updates

Debian schließt Sicherheitslücken selbst – wichtig bei einem Server mit offenem Port 25. Täglich,
und wenn ein Update (etwa der Kernel) es braucht, ein Neustart um 4:30 Uhr, nach dem Backup um
3:00 Uhr; die Dienste starten danach von selbst (Quadlet):

```bash
apt-get install -y unattended-upgrades
printf '%s\n' 'APT::Periodic::Update-Package-Lists "1";' 'APT::Periodic::Unattended-Upgrade "1";' \
  > /etc/apt/apt.conf.d/20auto-upgrades
printf '%s\n' 'Unattended-Upgrade::Automatic-Reboot "true";' \
  'Unattended-Upgrade::Automatic-Reboot-Time "04:30";' \
  'Unattended-Upgrade::Remove-Unused-Dependencies "true";' > /etc/apt/apt.conf.d/52kontext-unattended
unattended-upgrade --dry-run -v | grep -i "allowed origins"
```

Das betrifft nur Debian (Kernel, SSH, Podman …), **nicht die Container**: Deren Versionen stehen
fest in den Quadlet-Dateien und ändern sich nur von Hand, siehe [Updates](installation.md#6-updates).
