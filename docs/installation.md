---
description: >-
  Kontext auf dem eigenen Server installieren: DNS, Docker Compose oder Podman Quadlet, Stalwart
  einrichten, Firmenverwaltung, Anrufe, Telefonbox, Dokumente, Backups mit Restic und
  Wiederherstellen, Updates, alle Einstellungen und Fehlersuche.
---

# Installation

Ein Server pro Kunde. Er braucht Docker (oder Podman), eine feste IPv4-Adresse und eine Domain.
Für zehn Benutzer reicht ein kleiner VPS (2 vCPU, 4 GB RAM, 80 GB SSD).
Einen neuen VPS zuerst absichern: [VPS einrichten – erste Schritte](vps.md).

## 1. Server und DNS

Vorher prüfen: Der Anbieter darf Port 25 nicht sperren, und der Reverse-DNS-Eintrag (PTR) der
IP muss sich setzen lassen.

| Eintrag | Name                             | Wert                                                                |
| ------- | -------------------------------- | ------------------------------------------------------------------- |
| A       | `mail.firma.de`                  | IP des Servers                                                      |
| A       | `kontext.firma.de`             | IP des Servers                                                      |
| A       | `dokumente.firma.de`             | IP des Servers (nur mit [Dokumente](#dokumente))                    |
| A       | `mta-sts.firma.de`               | IP des Servers (MTA-STS, siehe unten)                               |
| A       | `openpgpkey.firma.de`            | IP des Servers (OpenPGP-Schlüssel per WKD)                          |
| MX      | `firma.de`                       | `10 mail.firma.de`                                                  |
| TXT     | `firma.de`                       | `v=spf1 mx -all`                                                    |
| TXT     | `<selector>._domainkey.firma.de` | DKIM-Schlüssel aus Stalwart                                         |
| TXT     | `_dmarc.firma.de`                | `v=DMARC1; p=none; rua=mailto:dmarc@firma.de` (später `quarantine`) |
| PTR     | IP des Servers                   | `mail.firma.de` (beim Anbieter einstellen)                          |

Dazu für die Verschlüsselung unterwegs ([Konzept](encryption.md)): **MTA-STS** und **TLS-RPT**
verlangen von anderen Mailservern, nur verschlüsselt an `firma.de` zuzustellen, und melden
Probleme. Stalwart zeigt die passenden Einträge unter *Domains → firma.de → DNS-Einträge* an
(`_mta-sts.firma.de`, `mta-sts.firma.de`, `_smtp._tls.firma.de`) und schreibt die Richtlinie;
Caddy liefert sie unter `https://mta-sts.firma.de` aus (dafür `MAIL_DOMAIN=firma.de` in
`deploy/.env`). Mit DNSSEC beim Anbieter kommt **DANE** dazu (ein
TLSA-Eintrag, ebenfalls aus Stalwart). Die Firmenverwaltung prüft, was davon gesetzt ist.

!!! warning "Cloudflare"
    Liegt das DNS bei Cloudflare, müssen alle Einträge für Mail und Kontext **„DNS only“**
    sein (graue Wolke). Durch den Cloudflare-Proxy kommen keine Mails und kein JMAP-Push.

## 2. Starten

```bash
# Die Konfiguration (compose.yaml, .env.example, Caddyfile, Backups); die Programme kommen von Docker Hub
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env            # nur root darf die Geheimnisse lesen
nano deploy/.env                 # Domain, Mailserver-Name, Geheimnis, Backup-Ziel
docker compose -f deploy/compose.yaml up -d   # lädt die Images von Docker Hub und startet sie
```

Für `KONTEXT_SECRET` eine lange Zufallszeichenfolge nehmen (`openssl rand -base64 48`); damit
sind die Sitzungen signiert und die Stalwart-Tokens verschlüsselt. Alle `change-me`-Platzhalter
ersetzen: Kontext startet nicht mit ihnen, `backup.sh` sichert nicht. `STALWART_ADMIN_KEY` bleibt
vorerst leer; er kommt in Schritt 3 dazu ([Firmenverwaltung einschalten](#firmenverwaltung-einschalten)).
Alle Einstellungen stehen unter [Einstellungen im Überblick](#einstellungen-im-uberblick). Für Anrufe im Chat ebenso
`LIVEKIT_SECRET` setzen und in der Firewall **TCP 7881 und UDP 7882** öffnen (siehe
[Anrufe](#anrufe)). Caddy holt das Zertifikat für
`KONTEXT_DOMAIN` selbst. Mit Podman liegen die Quadlet-Dateien in
`deploy/quadlet/` (nach `/etc/containers/systemd/` kopieren, `systemctl daemon-reload`); Domain
und Adressen stehen dort in jeder Datei selbst, jeder Dienst bekommt nur seine eigenen
Einstellungen (`kontext.env`, `livekit.env` … mit `chmod 600`), keiner `deploy/.env`.

## 3. Stalwart einrichten

Stalwarts eigene Verwaltung lauscht nur auf dem Server selbst (`127.0.0.1:8080`), nie im
Internet. Vom eigenen Rechner über einen SSH-Tunnel, dann `http://localhost:8080` im Browser:

```bash
ssh -L 8080:127.0.0.1:8080 root@<server>
```

Wer Tailscale nutzt, trägt stattdessen die Tailscale-Adresse des Servers ein (`TAILSCALE_IP` in
`deploy/.env`, bei Quadlet in `stalwart.container`) und erreicht sie unter
`http://<tailscale-ip>:8080`. Beim ersten Start steht ein vorläufiges Admin-Passwort im Log
(`docker compose -f deploy/compose.yaml logs stalwart`, mit Podman `podman logs stalwart`); nach
jedem Neustart vor der Einrichtung gibt es ein neues.

1. **Domain** `firma.de` anlegen, DKIM-Schlüssel erzeugen und als TXT-Eintrag ins DNS.
2. **TLS** für `mail.firma.de` per ACME, am einfachsten mit DNS-01 (Cloudflare-API-Token), weil
   Port 443 bei Caddy liegt. Vorsicht: Mit DNS-Verwaltung veröffentlicht Stalwart selbst die
   Einträge, die unter *DNS-Einträge veröffentlichen* angehakt sind – nach der Ersteinrichtung mit
   Token auch **MX, SPF und DMARC `p=reject`**. Läuft die Mail der Domain noch woanders, ist sie
   damit sofort umgestellt. Bis zum Umzug nur *DKIM* anhaken
   ([ohne Oberfläche](vps.md#10-stalwart-ohne-oberflache-einrichten)).
3. **Port 587** (Submission mit STARTTLS) unter *Netzwerk → Listener* anlegen: Stalwarts
   Standard hat nur 465, viele Mailprogramme nehmen 587.
4. **Firmenverwaltung einschalten** – nötig, nicht optional: den API-Schlüssel anlegen und als
   `STALWART_ADMIN_KEY` eintragen ([Anleitung unten](#firmenverwaltung-einschalten)), dann das
   Konto des Chefs anlegen. Weitere Mitarbeiter und gemeinsame Postfächer legt der Chef danach
   selbst in Kontext an.
5. Unter *Netzwerk → HTTP* **X-Forwarded-For verwenden** (`useXForwarded`) einschalten, damit
   Stalwart bei CalDAV/CardDAV und Autoconfig (über Caddy) die echten IP-Adressen sieht.
6. Unter *Sicherheit → Erlaubte IPs* das Container-Netz **`10.89.250.0/24`** eintragen
   (`AllowedIp`). Kontext meldet alle Personen von seiner einen Adresse an; ohne den Eintrag
   sperrt Stalwart nach 100 Fehlversuchen am Tag (`authBanRate`) diese Adresse – und damit
   Kontext für alle. Gegen das Raten von Passwörtern bremst Kontext selbst: 10 Fehlversuche je
   Anmeldename in 15 Minuten, dazu 10 Anmeldungen je IP-Adresse in der Minute.
7. Unter *Sicherheit* eine **Sperrdauer** setzen (`authBanPeriod`, `scanBanPeriod`, z. B. ein
   Tag). Ohne Dauer bleibt eine Sperre für immer.
8. Unter *Suche* die **Standardsprache** auf Deutsch (`de-DE`) stellen. Stalwart bildet damit
   die Wortstämme deutsch, auch bei kurzen Mails, deren Sprache es nicht sicher erkennt.
9. Unter *JMAP* die **gleichzeitigen Anfragen** (`maxConcurrentRequests`) auf 16 stellen.
   Stalwart erlaubt sonst 4 je Person – für alle Tabs und Geräte zusammen; Kontext fragt beim
   Start mehr auf einmal (Ordner jedes Postfachs, Liste, Unterhaltungen), und was darüber liegt,
   lehnt Stalwart ab.
10. In den Kalender-Einstellungen (`x:CalendarScheduling`) **HTTP-RSVP ausschalten**
    (`httpRsvpEnable: false`), das Scheduling selbst (`enable`) aber anlassen. Einladungen
    verschickt Kontext mit eigenen Knöpfen; Stalwarts Knöpfe zeigten auf eine Adresse, unter der
    Caddy antwortet (siehe [Einladungen](architecture.md#einladungen)). Die Knöpfe in Kontexts
    Einladungen brauchen die Firmenverwaltung (den Schlüssel unten).
11. In den SMTP-Anmeldeeinstellungen (`x:MtaStageAuth`, `saslMechanisms`) die zweite Regel
    löschen, die auf 587 `oauthbearer` und `xoauth2` **ohne TLS** anbietet, sodass nur noch
    `local_port != 25 && is_tls` → `[plain, login, oauthbearer, xoauth2]` stehen bleibt. Ein
    Token ginge sonst im Klartext, wenn jemand STARTTLS aus der Verbindung streicht. Kontext
    selbst verschickt über JMAP, nicht über SMTP.

Danach unter `https://kontext.firma.de` anmelden. Am Handy im Browser „Zum Startbildschirm
hinzufügen“ wählen: Kontext startet dann wie eine App und bleibt angemeldet.

### Anrufe

Anrufe und Besprechungen im Chat laufen über LiveKit, das `compose.yaml` mit dem Profil `calls`
startet (`COMPOSE_PROFILES=calls` in `.env`; `.env.example` hat `calls,documents`). Dafür braucht es:

- `LIVEKIT_SECRET` in `.env`: mindestens 32 Zeichen (`openssl rand -base64 48`). Kontext und
  LiveKit nutzen denselben.
- In der Firewall des Servers (und beim Anbieter) **TCP 7881** und **UDP 7882** offen. Darüber
  gehen Ton und Bild; die Anmeldung am Gespräch läuft über Caddy (`https://kontext.firma.de/rtc`).
- LiveKit findet die öffentliche IP des Servers selbst (STUN). Sitzt der Server hinter NAT, in
  `deploy/livekit.yaml` unter `rtc` `node_ip: <öffentliche IP>` eintragen und
  `use_external_ip: false` setzen.

Mit Podman: `deploy/quadlet/livekit.container` mitkopieren, `LIVEKIT_KEYS="kontext: <secret>"` in
`/opt/kontext/deploy/livekit.env` und dasselbe Geheimnis als `LIVEKIT_API_SECRET` in
`kontext.env`. Ohne Geheimnis bleiben die Anrufe aus, alles andere läuft wie gehabt.

Für zehn Leute reicht der kleine VPS; ein Videogespräch zu dritt braucht am Server etwa
3–5 Mbit/s je Teilnehmer in jede Richtung.

### Telefonie

Damit die Firmennummer auch in Kontext klingelt und man aus Kontext anrufen kann, braucht es
LiveKit SIP und Redis auf dem Server (im Profil `calls` schon dabei) und eine Telefonbox im Büro.

**Auf dem Server:** in der Firewall zusätzlich **TCP 5060** (SIP von den Boxen) und
**UDP 20000–20100** (Sprache) öffnen. Kontext meldet die Boxen bei LiveKit SIP selbst an; unter
Einstellungen → Telefonie steht, ob das geklappt hat. Die Telefonie-Einstellungen gehören zur
Firmenverwaltung und brauchen deshalb auch `STALWART_ADMIN_KEY`.

Mit Podman kommen zu `livekit.container` (siehe [Anrufe](#anrufe)) `redis.container` und
`livekit-sip.container` nach `/etc/containers/systemd/`, dazu `/opt/kontext/deploy/livekit-sip.env`
mit `SIP_CONFIG_BODY` in einer Zeile und dem LiveKit-Geheimnis als `api_secret`. Die Befehle
dafür stehen in [VPS einrichten, Schritt 9](vps.md#9-kontext-mit-quadlet-starten); danach
`systemctl daemon-reload` und `systemctl start redis livekit livekit-sip`.

**In der Fritzbox:** Telefonie → Telefoniegeräte → Neues Gerät einrichten → „Telefon (mit und
ohne Anrufbeantworter)“ → „LAN/WLAN (IP-Telefon)“, Name „Kontext“. Benutzername und Kennwort
merken und festlegen, auf welche Rufnummern das Gerät reagiert und mit welcher es anruft. Für
Durchwahlen je Nummer ein weiteres Gerät dieser Art anlegen, das nur auf diese Nummer reagiert
und mit ihr anruft, und es in Kontext unter „Weitere Rufnummern“ eintragen.

**In Kontext:** Einstellungen → Telefonie: als Adresse der Fritzbox ihre IP (meist
`192.168.178.1`), Benutzername und Kennwort aus der Fritzbox eintragen, auswählen, wer klingeln
soll, dann „Box koppeln“. Ein Name wie `fritz.box` geht auch: Die Box löst ihn selbst nach IPv4
auf, denn er zeigt auch auf die IPv6-Adresse der Fritzbox, und Asterisk spricht nur IPv4. Die
Seite zeigt von selbst, sobald die Box verbunden und an der Fritzbox angemeldet ist.

**Die Box:** ein Gerät im Büronetz, das immer läuft – gebrauchter Thin Client (Futro S740,
Wyse 5070), Raspberry Pi mit SSD, der Firmenserver oder ein NAS mit Docker. Am besten per Kabel.
Auf das Gerät kommt nur eine Datei, `deploy/box.compose.yaml` – heruntergeladen (die Version im
Pfad passend zum Kontext-Server) oder mit dem ganzen Repository (`git clone`, dann
`-f deploy/box.compose.yaml`):

```bash
mkdir -p /opt/kontext-box && cd /opt/kontext-box
curl -fsSLO https://raw.githubusercontent.com/firsttris/kontext/v0.1.6/deploy/box.compose.yaml
echo KONTEXT_VERSION=0.1.6 > .env      # dieselbe Version wie der Server; ohne Zeile: latest
KONTEXT_URL=https://kontext.firma.de PAIRING_CODE=K7QM-4XPA \
  docker compose -f box.compose.yaml up -d
```

Der Code steht in Kontext unter Einstellungen → Telefonie → „Box koppeln“ und wird nur beim
ersten Start gebraucht. `box.compose.yaml` nimmt das Image `tristanteu/kontext-box` in der Version
aus `KONTEXT_VERSION` (Compose liest die `.env` im Ordner der Datei) und sonst `latest`. Für ein
Update dort die Version heben, dann `docker compose -f box.compose.yaml pull` und
`docker compose -f box.compose.yaml up -d`; von selbst aktualisiert sich die Box nicht.

Die Box braucht eine **feste Adresse im LAN** (in der Fritzbox unter Heimnetz → Netzwerk →
Gerät → „Diesem Netzwerkgerät immer die gleiche IPv4-Adresse zuweisen“). Nach außen braucht sie
keine offenen Ports, nur ausgehend Kontext (HTTPS, 443) und den Kontext-Server auf TCP 5060 und
UDP 20000–20100. Läuft auf dem Gerät eine Firewall, aus dem LAN 5070 TCP+UDP, 10000–10200 UDP und
8089 TCP erlauben. SIP auf 5070 lauscht erst nach dem Koppeln; davor gibt es nur die Statusseite.

**Tischtelefone (Snom):** in Kontext unter Telefonie → Tischtelefone mit MAC-Adresse anlegen,
dann im Telefon (Weboberfläche → Erweitert → Update) als Einstellungs-URL
`http://<box>:8089/snom/{mac}.xml` eintragen und neu starten; es holt sich Konto und Einstellungen
von der Box. Die Box braucht dafür eine feste Adresse im LAN. Das Passwort gibt sie nur beim
ersten Abruf heraus; nach einem Zurücksetzen des Telefons das Tischtelefon in Kontext löschen und
neu anlegen.

Mit Podman: `deploy/quadlet/kontext-box.container` nach `/etc/containers/systemd/` kopieren
(auch einzeln herunterladen wie oben), `systemctl daemon-reload`, `systemctl start kontext-box`;
nach einem Neustart startet die Box von selbst. Die Datei nennt `Image=…/kontext-box:latest`; besser
dort die Version des Servers eintragen (`kontext-box:0.1.6`). Für ein Update die Version heben,
`systemctl daemon-reload`, `podman pull docker.io/tristanteu/kontext-box:<version>` und
`systemctl restart kontext-box` – mit `latest` holt ein Neustart kein neues Image. Ohne Code beim Start zeigt die Box auf `http://<box>:8089` ein Formular für Kontexts
Adresse und den Code; mit Code stehen `KONTEXT_URL` und `PAIRING_CODE` in `/etc/kontext-box.env`.
Sie läuft im Host-Netz (SIP mit der Fritzbox auf 5070, Sprache auf 10000–10200 im LAN).

Die Box selbst bauen (etwa für eine Version, die noch nicht auf Docker Hub ist), ab v0.1.4 –
die Box bis v0.1.3 lädt die Konfiguration aus Kontext nicht und meldet sich nie an der Fritzbox an:

```bash
git clone --depth 1 --branch v0.1.4 https://github.com/firsttris/kontext.git /opt/kontext-box-src
cd /opt/kontext-box-src
podman build -f box/Dockerfile -t kontext-box:0.1.4 .
```

Im Quadlet dann `Image=localhost/kontext-box:0.1.4` (Podman setzt `localhost/` vor lokal gebaute
Images); mit Docker heißt es `kontext-box:0.1.4`, und `docker build` statt `podman build`.

Prüfen: `curl http://127.0.0.1:8089/` zeigt „Kontext-Telefonbox“, und
`podman exec kontext-box asterisk -rx "module show like res_pjsip.so"` zeigt `res_pjsip.so`.
Die Meldung „There are no local system nameservers configured, resorting to system resolution“
beim Start ist harmlos: Asterisk auf Alpine liest die Nameserver nicht selbst und nimmt dann die
des Systems.

**Wenn die Box sich nicht an der Fritzbox anmeldet** (mit Docker `docker` statt `podman`):

- `podman exec kontext-box asterisk -rx "pjsip show registrations"` zeigt die Anmeldung.
  „No objects found“: Asterisk hat die Konfiguration nicht geladen – auf der Statusseite steht
  dann bei „Konfiguration“ der Grund. `Registered`: alles gut.
- „Rejected“ mit „No response received“ im Log (`podman logs kontext-box`): Die Fritzbox hat nie
  geantwortet. Als Adresse der Fritzbox ihre IP eintragen; `ping 192.168.178.1` prüft, ob sie
  erreichbar ist.
- „Rejected“ mit `403 Forbidden`: Benutzername oder Kennwort passen nicht zum IP-Telefon in der
  Fritzbox (die Box versucht es dann erst nach 5 Minuten wieder).
- `ss -lunp | grep 5070` zeigt, ob die Box auf 5070 lauscht; eine Firewall auf dem Gerät muss
  5070 und 10000–10200 aus dem LAN durchlassen.

### Dokumente

Das Modul „Dokumente“ ist [Schreibzeug](https://github.com/firsttris/schreibzeug), ein eigener
Dienst mit eigenen Daten und Versionen. `compose.yaml` startet ihn mit dem Profil `documents`
(`COMPOSE_PROFILES=calls,documents` in `.env`, so in `.env.example`). Dafür braucht es:

- eine eigene Adresse unter derselben Domain, etwa `dokumente.firma.de` (A-Eintrag wie Kontext),
  als `SCHREIBZEUG_URL=https://dokumente.firma.de` in `.env`. Caddy holt das Zertifikat dafür
  selbst. Dieselbe Domain hält Rahmen und Anmeldung ohne Umwege (keine Drittanbieter-Cookies).
- `SCHREIBZEUG_CLIENT_SECRET` in `.env`: mindestens 32 Zeichen (`openssl rand -base64 48`). Damit
  meldet sich Schreibzeug bei Kontext an; Kontext trägt Schreibzeug beim Start als vertrauten
  Client ein, ohne Zustimmungsseite.

Wer in Kontext angemeldet ist, ist es dann auch in Dokumente; Anhänge lassen sich dort ablegen und
Dokumente an Mails hängen. Jedes gemeinsame Postfach bekommt dort einen eigenen Ordner für seine
Leute; dafür liest Kontext die Mitglieder mit `STALWART_ADMIN_KEY`, wie für die Firmenverwaltung. Ohne `SCHREIBZEUG_URL` fehlt das Modul, alles andere läuft wie gehabt.
Schreibzeug läuft auch für sich unter seiner Adresse, mit „Anmelden mit Kontext“.

Mit Podman: `deploy/quadlet/schreibzeug.container` mitkopieren, in
`/opt/kontext/deploy/schreibzeug.env` `SCHREIBZEUG_URL`, `SCHREIBZEUG_EMBED_ORIGIN=https://kontext.firma.de`,
`OIDC_ISSUER=https://kontext.firma.de/api/auth` und `OIDC_CLIENT_SECRET` (dasselbe Geheimnis)
eintragen, `SCHREIBZEUG_URL` und `SCHREIBZEUG_CLIENT_SECRET` auch in `kontext.env`.

**Ohne Dokumente:** mit Compose `documents` aus `COMPOSE_PROFILES` nehmen und die beiden Zeilen
`SCHREIBZEUG_URL` und `SCHREIBZEUG_CLIENT_SECRET` aus `.env` löschen; leer ginge auch, denn
`compose.yaml` gibt Caddy dann einen Platzhalter (`https://schreibzeug.internal`), der niemandem
antwortet. Mit Quadlet `schreibzeug.container` nicht kopieren, die beiden Zeilen in `kontext.env`
weglassen und in `caddy.container` die Zeile `Environment=SCHREIBZEUG_URL=…` löschen: Caddy liest
die Adresse dort, nicht aus `kontext.env`, und holte sonst weiter ein Zertifikat für sie.

Der Server bleibt schlank: Bearbeiten und Texterkennung laufen im Browser.

### Ortsvorschläge

Im Feld „Ort“ eines Termins schlägt Kontext Adressen vor. Dafür fragt der Kontext-Server
[Photon](https://github.com/komoot/photon) (komoot, Daten von OpenStreetMap) unter
`https://photon.komoot.io/api/` – ohne Einstellung ist das an. Was jemand als Ort tippt, geht so
vom Server an komoot (nicht die Adresse des Browsers). Mit `PLACES_URL=` (leer) in `.env` bzw.
`kontext.env` sind die Vorschläge aus, das Feld nimmt weiter jeden Text. Ein eigenes Photon
(etwa nur mit den Daten für Deutschland) trägt man als `PLACES_URL=https://photon.firma.de/api/`
ein. Der öffentliche Dienst von komoot ist für maßvolle Nutzung gedacht; Kontext fragt erst nach
einer Tipp-Pause und ab drei Buchstaben.

### Firmenverwaltung einschalten

Unter *Einstellungen → Firma* legt der Chef (oder die Büroleitung) Mitarbeiter und gemeinsame
Postfächer an, setzt Passwörter und die Anmeldung mit Code zurück und sperrt Zugänge. Dafür
braucht der Kontext-Server einen API-Schlüssel von Stalwart, der nur Konten verwalten darf
(`STALWART_ADMIN_KEY`).

!!! warning "Ohne den Schlüssel fehlt viel"
    Kontext startet auch ohne `STALWART_ADMIN_KEY`, aber dann fehlen:

    - die **Firmenverwaltung** ganz – Mitarbeiter, gemeinsame Postfächer, Firmen-Signatur,
      Datensicherung, Telefonie-Einstellungen und der [Umzug](#umzug);
    - **Weitere Postfächer** (Gmail, GMX …): der Eintrag fehlt in den Einstellungen, weil der
      Server die abgerufenen Mails mit dem Schlüssel ins Postfach legt;
    - die **Antwort-Knöpfe** in Einladungen: Kontext verschickt sie ohne Ja / Nein / Vielleicht,
      denn eingetragen wird die Antwort mit dem Schlüssel
      ([Einladungen](architecture.md#einladungen));
    - in [Dokumente](#dokumente) die **Ordner je gemeinsamem Postfach**: Kontext liest die
      Mitglieder mit dem Schlüssel.

    Darum gehört er zur Einrichtung dazu (Schritt 4 unter [Stalwart einrichten](#3-stalwart-einrichten)).

1. In Stalwarts Verwaltung eine **Rolle** `Kontext-Server` anlegen: sie erbt die Rolle *User*
   und bekommt dazu die Rechte `sysAccountGet`, `sysAccountQuery`, `sysAccountCreate`,
   `sysAccountUpdate`, `sysRoleGet`, `sysRoleCreate`, `sysDomainGet`, `sysAuthenticationGet`
   und `impersonate`. Mit `impersonate` arbeitet der Server in den Postfächern der Mitarbeiter
   (Abwesenheit, Leserechte für gemeinsame Postfächer) und trägt Antworten auf Einladungen ein;
   die App zeigt dem Chef dabei nie fremde Mails.
2. Ein **Konto** `kontext-server@firma.de` mit dieser Rolle (statt *User*) und einem langen
   Zufallspasswort anlegen.
3. Mit diesem Konto einen **API-Schlüssel** erzeugen (*Credentials → API Key*, Rechte
   *Inherit*). Er beginnt mit `API_`; in `deploy/.env` als `STALWART_ADMIN_KEY` eintragen und
   Kontext neu starten (`docker compose -f deploy/compose.yaml up -d`); mit Quadlet in
   `deploy/kontext.env`, dann `systemctl restart kontext`. Ohne Oberfläche geht dasselbe über
   Stalwarts API ([VPS einrichten, Schritt 10](vps.md#10-stalwart-ohne-oberflache-einrichten)).
4. Beim ersten Aufruf legt Kontext die Rolle `Firmenverwaltung (Kontext)` an. Dem Konto des
   Chefs in Stalwart diese Rolle **zusätzlich zu User** geben. Danach kann er sie in Kontext
   selbst an weitere Personen weitergeben.

Stalwart lässt den Schlüssel keine Rechte vergeben, die er selbst nicht hat; ein Mitarbeiter wird
darüber also nie Admin. Kontext zeigt und ändert nur Konten mit der normalen Rolle *User*.
Er kann aber alle Postfächer lesen und Admin-Konten von Stalwart im Passwort ändern (Stalwart
prüft dabei die Rechte des Zielkontos nicht) – den Schlüssel deshalb wie ein Admin-Passwort
behandeln.

### Umzug

Unter *Einstellungen → Firma → Umzug* übernimmt der Chef die Daten der Mitarbeiter:

- **Postfach verbinden** für Gmail, GMX, WEB.DE, Telekom, IONOS, STRATO oder einen anderen
  IMAP-Server. Gmail braucht ein App-Passwort (im Google-Konto Bestätigung in zwei Schritten
  einschalten, dann *App-Passwörter*), GMX und WEB.DE den eingeschalteten IMAP-Zugriff. Der
  Abgleich läuft alle 15 Minuten, bis der Umzug abgeschlossen ist; danach beim alten Anbieter eine
  Weiterleitung einrichten oder den MX-Eintrag der eigenen Domain umstellen. Der Server braucht
  dafür ausgehend Port 993.
- **Microsoft 365**: einmal pro Kunde im
  [Microsoft Entra Admin Center](https://entra.microsoft.com) unter *App-Registrierungen* eine App
  „Kontext Umzug“ anlegen, unter *API-Berechtigungen* die **Anwendungsberechtigungen**
  `Mail.Read`, `Contacts.Read`, `Calendars.Read` und `User.Read.All` für Microsoft Graph
  (optional `MailboxSettings.Read`, damit Outlook-Kategorien ihre Farben behalten)
  hinzufügen und die Administratorzustimmung erteilen, unter *Zertifikate & Geheimnisse* einen
  geheimen Clientschlüssel erzeugen. Verzeichnis-ID, Anwendungs-ID und Schlüssel beim ersten
  „Postfach verbinden → Microsoft 365“ eintragen. Die App kann alle Postfächer des Mandanten
  lesen; nach dem Umzug den Schlüssel löschen oder die App entfernen.
- **Datei hochladen**: Outlook-Datendatei (`.pst`), Kontakte (`.vcf`) und Kalender (`.ics`), etwa
  aus dem Google-Export (*Google Kontakte → Exportieren → vCard*, *Google Kalender → Einstellungen →
  Exportieren*). Die Datei liegt bis zum Ende des Umzugs im Datenvolume und wird dann entpackt: Für
  eine 10-GB-PST also vorübergehend gut 20 GB frei haben.

Ein großer Umzug läuft mehrere Stunden, bei Gmail wegen dessen Tageslimit mehrere Tage, bei
Microsoft 365 bremst Graph bei vielen Abfragen; der
Fortschritt steht auf derselben Seite, auch nach einem Neustart.

### Wenn jemand sein Handy mit der Authenticator-App verliert

Mitarbeiter schalten die Anmeldung mit Code selbst unter *Einstellungen → Passwort und Sicherheit*
ein. Geht das Handy verloren, setzt der Chef sie unter *Einstellungen → Firma → Mitarbeiter* beim
Mitarbeiter zurück; danach meldet sich der Mitarbeiter wieder nur mit Passwort an und richtet den
Code neu ein.

### KI-Agenten

Agenten wie Claude verbinden sich über MCP mit `https://<KONTEXT_DOMAIN>/mcp`; einzurichten ist
nichts. Jede Person verbindet ihren Agenten selbst unter *Einstellungen → KI-Agenten* (Schlüssel)
oder trägt die Adresse in Claude als Connector ein und meldet sich im Browser an (OAuth). Dafür
gilt:

- Caddy gibt `/mcp` und die OAuth-Discovery (`/.well-known/oauth-protected-resource`,
  `/.well-known/oauth-authorization-server`) an Kontext, die übrigen `/.well-known`-Pfade weiter
  an Stalwart (`deploy/Caddyfile`).
- Der Kontext-Server muss ins Internet dürfen (HTTPS): Claude und andere Clients melden sich mit
  einer Adresse an, unter der ihre Beschreibung liegt (Client ID Metadata Document), und Kontext
  holt sie dort ab – nur öffentliche Adressen, ohne Weiterleitungen.
- Wer einen Agenten nicht mehr will, trennt ihn in den Einstellungen; das Sperren eines
  Mitarbeiters trennt alle seine Agenten.

## 4. Platte verschlüsseln

Mails, Chat, Aufgaben und Dateien liegen auf der Platte des Servers. Verschlüsselt ist sie
nutzlos für jemanden, der den Server oder eine Platte mitnimmt: beim Einrichten die Datenplatte
mit LUKS verschlüsseln (bei vielen VPS-Anbietern als Option beim Anlegen, sonst eine zweite
Platte mit `cryptsetup luksFormat` und darauf die Docker-Volumes). Den Schlüssel nicht auf dem
Server ablegen, sondern beim Neustart eingeben oder per Netzwerk entsperren (Clevis/Tang).

## 5. Backups

`deploy/backup.sh` sichert mit [Restic](https://restic.net) auf einen S3-Speicher, am einfachsten
Cloudflare R2 (S3-kompatibel, 10 GB frei) – Restic
verschlüsselt jede Sicherung mit dem Passwort aus `deploy/.env`, der Speicheranbieter sieht nur
Verschlüsseltes; das Passwort gehört zusätzlich an einen sicheren Ort außerhalb des Servers. Gesichert werden Stalwarts
Datenvolume (Mails, Kalender, Kontakte, Konten), eine Kopie der Kontext-Datenbank
(Anmeldungen, Firmen-Signatur, Aufgaben, Chat, Anrufliste, Stand der Umzüge), die Fotos und Dateien aus dem
Chat, Ansagen, Mailbox-Nachrichten, Faxe und Aufnahmen der Telefonie und die vertraulich gesendeten
Mails, mit Dokumente auch Schreibzeugs Datenbank (Kopie) und Dateien. Hochgeladene PST-Dateien bleiben draußen. Am besten einen Bucket mit **Object Lock** nehmen, dann kann auch ein Angreifer mit
Zugriff auf den Server die Sicherungen nicht löschen. Ein GoBD-Archiv für Mails ersetzt das nicht. Die Sperrfrist
im Bucket höchstens 14 Tage: `backup.sh` hebt 14 Tage, 8 Wochen und 12 Monate auf und räumt den
Rest weg; länger gesperrte Dateien lassen sich nicht löschen. Das meldet das Skript, prüft die
Sicherung aber trotzdem.

Das Ziel liegt **nicht auf dem Server selbst**: Fällt er aus oder wird er übernommen, wäre ein
Backup daneben mit weg, und es füllte die Platte, auf der Stalwart die Mails annimmt. Geeignet:

| Ziel | `RESTIC_REPOSITORY` | Kosten |
| --- | --- | --- |
| Cloudflare R2 (S3) | `s3:https://<konto-id>.r2.cloudflarestorage.com/kontext-firma` | 10 GB frei, danach etwa 1,5 Cent je GB und Monat |
| Backblaze B2 (S3) | `s3:https://s3.eu-central-003.backblazeb2.com/kontext-firma` | 10 GB frei |
| anderer S3-Speicher | `s3:https://…/kontext-firma` | je nach Anbieter |
| NAS oder Speicherbox per SFTP | `sftp:backup@nas.firma.de:/kontext` | eigene Hardware bzw. Storage Box |

Restic komprimiert und legt Gleiches nur einmal ab; die erste Sicherung ist so groß wie die
Daten, jede weitere nur so groß wie das Neue. Für S3 setzt man `AWS_ACCESS_KEY_ID` und
`AWS_SECRET_ACCESS_KEY` (bei R2 ein API-Token mit *Object Read & Write* für den einen Bucket); per
SFTP meldet sich root mit einem SSH-Schlüssel an (`ssh-keygen`, den öffentlichen Teil beim Ziel
hinterlegen, einmal `ssh backup@nas.firma.de` zum Bestätigen des Host-Schlüssels).

Bei R2 den Bucket mit Standort **EU** anlegen; der Endpoint heißt dann
`https://<konto-id>.eu.r2.cloudflarestorage.com` (der ohne `.eu` findet EU-Buckets nicht). Ein
IP-Filter am Token braucht die IPv4-Adresse **und** das IPv6-Netz des Servers: Restic geht
bevorzugt über IPv6, sonst antwortet R2 mit *Access Denied*.

Nach jeder Sicherung misst `backup.sh` die Größe und schreibt ab 8 GB eine Warnung ins Log
(`BACKUP_WARN_GB` in den Einstellungen ändert die Grenze) – vor dem Ende der freien 10 GB. Bei R2
zusätzlich unter *Notifications → Usage Based Billing* eine Mail ab etwa 8 GB einrichten; die kommt
auch, wenn der Server schweigt.

Restic muss auf dem Server installiert sein (`apt-get install restic`).

Jede Nacht starten systemd-Units die Sicherung (Vorlagen in `deploy/systemd/`). Mit ihnen zeigt
die Firmenverwaltung unter *Datensicherung* den letzten Lauf und den belegten Speicher, stellt die
Uhrzeit und sichert auf Knopfdruck. Kontext bekommt dafür keinen Zugriff auf den Server: Es
legt nur Wünsche in seinem Volume ab, die die Units abholen
([Architektur](architecture.md#firmenverwaltung)).

```bash
cd /opt/kontext/deploy
./backup-control.sh install     # Units nach /etc/systemd/system, Volume-Pfad eingesetzt
systemctl enable --now kontext-backup.timer kontext-backup-control.path
crontab -l | grep -v 'deploy/backup.sh' | crontab -   # alter Cron-Eintrag, falls vorhanden
systemctl start kontext-backup.service                # erste Sicherung, Protokoll: journalctl -u kontext-backup
```

Die Units:

| Unit | Aufgabe |
| --- | --- |
| `kontext-backup.service` | ruft `backup.sh` auf (das sperrt per `flock`: nie zwei Läufe gleichzeitig, auch nicht von Hand oder per Cron), Ausgabe ins Journal und an Kontext, Status am Anfang und am Ende |
| `kontext-backup.timer` | jede Nacht um 03:00 (Europe/Berlin), holt eine verpasste Nacht nach (`Persistent=true`) |
| `kontext-backup-control.path` | beobachtet die Uhrzeit und „Jetzt sichern“ aus Kontext und startet `kontext-backup-control.service` |

`install` findet das Volume `kontext-data` (Quadlet) bzw. `kontext_kontext-data` (Compose) über
`podman volume inspect` bzw. `docker volume inspect`. Die Uhrzeit aus Kontext landet in
`/etc/systemd/system/kontext-backup.timer.d/time.conf`; wird sie auf eine Zeit vorgezogen, die
heute schon vorbei ist, sichert der Timer gleich einmal (`Persistent=true`). Nach einem `git pull`
mit geänderten Units `./backup-control.sh install` erneut ausführen.

Ohne die Units geht es weiter mit Cron; die Firmenverwaltung zeigt dann „Steuerung auf dem
Server nicht eingerichtet“:

```bash
crontab -e
0 3 * * *  /opt/kontext/deploy/backup.sh >> /var/log/kontext-backup.log 2>&1
```

Mit Podman (Quadlet) gibt es kein `deploy/.env`; das Skript erkennt das an
`/etc/containers/systemd/kontext.container` und liest seine Einstellungen aus
`deploy/backup.env` (`chmod 600`):

```
KONTEXT_DOMAIN=kontext.firma.de
RESTIC_REPOSITORY=s3:https://s3.eu-central-1.example.com/kontext-firma
RESTIC_PASSWORD=…
AWS_ACCESS_KEY_ID=…
AWS_SECRET_ACCESS_KEY=…
```

Der Mailserver hält dafür ein paar Sekunden an; absendende Server versuchen es einfach
erneut. Die Kontext-Datenbank wird im laufenden Betrieb kopiert (`VACUUM INTO`). Einmal im Monat
eine Wiederherstellung auf einem Testserver üben, wie unten beschrieben.

### Wiederherstellen

Restic legt je Lauf drei Sicherungen an, erkennbar am Tag: `stalwart` (Stalwarts Datenvolume),
`kontext` (die Kopie der Datenbank unter `backup/kontext.db` und die Ordner `chat-files`,
`photos`, `phone`, `secure`) und mit Dokumente `schreibzeug` (`backup/schreibzeug.db`, `blobs`,
`auth-secret`). Gesichert sind die Volumes unter ihrem Pfad auf dem Server, etwa
`/var/lib/docker/volumes/kontext_stalwart-data/_data` (Compose mit Docker) oder
`/var/lib/containers/storage/volumes/stalwart-data/_data` (Quadlet). Die Volumes heißen mit
Compose `kontext_stalwart-data`, `kontext_kontext-data`, `kontext_schreibzeug-data`, mit Quadlet
ohne Vorsilbe `stalwart-data`, `kontext-data`, `schreibzeug-data`.

Nicht in der Sicherung: die Einstellungen (`deploy/.env` bzw. die Quadlet-Dateien und
`kontext.env` … – darum gehören sie in den Passwortmanager, siehe
[Zugangsdaten sichern](vps.md#13-zugangsdaten-sichern)) und Stalwarts Volume `stalwart-config`.
Darin steht nur `config.json` mit dem Speicherort; alles andere (Domains, Konten, DKIM-Schlüssel,
Einstellungen) liegt in Stalwarts Datenbank und kommt mit `stalwart` zurück.

**1. Server bereitstellen.** Auf einem neuen Server Kontext wie in den Schritten 1 und 2 mit
denselben Einstellungen installieren und starten, dann Stalwarts Ersteinrichtung durchlaufen
(Benutzer `admin`, Passwort aus dem Log), mit dem vorgegebenen Speicher (RocksDB unter
`/var/lib/stalwart/`) – erst dann gibt es `config.json`. Was man dabei einträgt, ersetzt gleich
die Sicherung. Auf dem alten Server entfällt dieser Schritt.

**2. Restic die Einstellungen geben** – dieselben, mit denen `backup.sh` sichert, als root:

```bash
apt-get install -y restic
cd /opt/kontext/deploy
set -a; . ./.env; set +a          # mit Quadlet: . ./backup.env
restic snapshots                  # alle Sicherungen mit Tag, Zeit und Pfad
```

**3. Dienste anhalten**, damit nichts in die Volumes schreibt:

```bash
docker compose -f compose.yaml stop                      # Compose
systemctl stop caddy schreibzeug kontext stalwart        # Quadlet
```

**4. Zurückholen** in einen leeren Ordner, dann in die Volumes. `vol` nennt den Pfad eines
Volumes; mit Podman Compose `podman` statt `docker`:

```bash
vol() { docker volume inspect -f '{{ .Mountpoint }}' "kontext_$1"; }   # Compose
vol() { podman volume inspect -f '{{ .Mountpoint }}' "$1"; }           # Quadlet

restic restore latest --tag stalwart --target /tmp/restore
restic restore latest --tag kontext --target /tmp/restore
restic restore latest --tag schreibzeug --target /tmp/restore   # nur mit Dokumente

S=$(vol stalwart-data)
find "$S" -mindepth 1 -delete && cp -a "/tmp/restore$S/." "$S/"

K=$(vol kontext-data)
rm -f "$K/kontext.db" "$K/kontext.db-wal" "$K/kontext.db-shm"
cp -a "/tmp/restore$K/backup/kontext.db" "$K/kontext.db"
for d in chat-files photos phone secure; do rm -rf "${K:?}/$d"; cp -a "/tmp/restore$K/$d" "$K/"; done

D=$(vol schreibzeug-data)                                        # nur mit Dokumente
rm -f "$D/schreibzeug.db" "$D/schreibzeug.db-wal" "$D/schreibzeug.db-shm"
cp -a "/tmp/restore$D/backup/schreibzeug.db" "$D/schreibzeug.db"
rm -rf "${D:?}/blobs" "$D/auth-secret"
cp -a "/tmp/restore$D/blobs" "/tmp/restore$D/auth-secret" "$D/"
```

Die Pfade in der Sicherung sind die des alten Servers. Läuft der neue genauso (Compose mit Docker
bzw. Quadlet), sind sie gleich; sonst zeigt `restic snapshots` sie in der Spalte *Paths*, und statt
`/tmp/restore$S` steht dann `/tmp/restore<alter Pfad>`. Restic stellt Besitzer und Rechte mit
her, `cp -a` behält sie.

Mit Quadlet in Schritt 3 und 5 nur die Units nennen, die es auf dem Server gibt (ohne Dokumente
kein `schreibzeug`, ohne Anrufe kein `redis`, `livekit`, `livekit-sip`).

**5. Starten und prüfen:**

```bash
docker compose -f compose.yaml up -d                                      # Compose
systemctl start stalwart redis livekit livekit-sip kontext schreibzeug caddy   # Quadlet
```

Danach in Kontext anmelden: Mails, Termine, Aufgaben und Chat sind wieder da. Ändern sich auf
einem neuen Server die IP-Adressen, die DNS-Einträge (A, PTR) nachziehen. `/tmp/restore` zum
Schluss löschen.

Fehlt die Kopie der Kontext-Datenbank, geht nichts in Stalwart verloren: alle melden sich einmal
neu an, die Vorlage der Firmen-Signatur ist neu einzutragen; Aufgaben und Chat sind dann leer.

## 6. Updates

Was sich in jeder Version geändert hat und welche Versionen einen Schritt mehr brauchen, steht im
[Changelog](https://github.com/firsttris/kontext/blob/main/CHANGELOG.md). Vorher ein Backup machen
(`systemctl start kontext-backup.service` oder „Jetzt sichern“ in der Firmenverwaltung).

**Mit Compose:**

```bash
cd /opt/kontext && git pull
git diff ORIG_HEAD -- deploy/    # was sich in deploy/ geändert hat: .env.example, compose.yaml, Caddyfile, Units
nano deploy/.env                 # KONTEXT_VERSION auf die neue Version, z. B. 0.1.6; neue Zeilen aus .env.example übernehmen
docker compose -f deploy/compose.yaml pull && docker compose -f deploy/compose.yaml up -d
```

- `deploy/.env` ist die eigene Kopie von `.env.example` und ändert sich mit `git pull` nicht. Neue
  Einstellungen zeigt `git diff ORIG_HEAD -- deploy/.env.example` (oder ein Vergleich beider
  Dateien); was dort neu ist, in `.env` übernehmen.
- `KONTEXT_VERSION` hebt Kontext; die aktuelle Version steht in `.env.example` und unter
  [Releases](https://github.com/firsttris/kontext/releases). `SCHREIBZEUG_VERSION` hebt
  Schreibzeug, das eigene Versionen hat ([Releases von Schreibzeug](https://github.com/firsttris/schreibzeug/releases));
  fehlt die Zeile, nimmt `compose.yaml` `latest`.
- Stalwart, LiveKit, LiveKit SIP, Redis und Caddy stehen mit festen Versionen in
  `deploy/compose.yaml`; neue kommen mit `git pull`, und `pull` holt sie.
- Hat sich `deploy/Caddyfile` geändert, Caddy neu laden:
  `docker compose -f deploy/compose.yaml restart caddy`.
- Haben sich die Units in `deploy/systemd/` geändert, in `deploy/` `./backup-control.sh install`
  erneut ausführen.

**Mit Quadlet:** Die Dateien unter `/etc/containers/systemd/` sind Kopien aus `deploy/quadlet/`
mit der eigenen Domain ([VPS einrichten, Schritt 9](vps.md#9-kontext-mit-quadlet-starten)); `git
pull` ändert sie nicht.

```bash
cd /opt/kontext && git pull
git diff ORIG_HEAD -- deploy/              # neue Image-Versionen, Einstellungen, Units
cd /etc/containers/systemd
nano kontext.container schreibzeug.container   # Image=…/kontext:<neue Version>, …/schreibzeug:<neue Version>
systemctl daemon-reload
for i in $(grep -h '^Image=' *.container | cut -d= -f2); do podman pull $i; done
systemctl restart kontext schreibzeug          # und jeder Dienst, dessen Image sich geändert hat
```

Hat sich in `deploy/quadlet/` mehr geändert als die Version (etwa eine neue `Environment=`-Zeile),
das auch in die Kopie übernehmen; `deploy/Caddyfile` wird direkt eingebunden, dann
`systemctl restart caddy`.

Die Images aktualisieren sich nicht selbst (auch nicht mit Podman-Auto-Update): Ein neues kommt
nur, wenn man die Version hebt. Ausnahmen, die auf `latest` stehen, bis man eine Version einträgt:
Schreibzeug mit Compose ohne `SCHREIBZEUG_VERSION` und die Telefonbox (siehe
[Telefonie](#telefonie)).

Seit 0.1.3 läuft der Kontext-Server nicht mehr als root, sondern als Benutzer `bun`. Ein Volume aus
einer älteren Version gehört noch root; einmal übergeben, dann starten:

```bash
docker compose -f deploy/compose.yaml run --rm --user root --entrypoint chown kontext -R bun:bun /data
docker compose -f deploy/compose.yaml up -d
```

Vor einem Stalwart-Update mit neuer Hauptversion die `UPGRADING`-Hinweise von Stalwart lesen und
vorher ein Backup machen.

Kontext und Schreibzeug haben getrennte Images und Versionen (`KONTEXT_VERSION`,
`SCHREIBZEUG_VERSION`); beim Start prüft Kontext nur, ob Schreibzeug antwortet, und schreibt sonst
eine Warnung ins Log.

## Einstellungen im Überblick

### `deploy/.env` (Compose)

`compose.yaml` liest diese Datei und reicht daraus an jeden Dienst nur, was er braucht;
`backup.sh` liest sie ganz. Mit Quadlet gibt es sie nicht: Die Werte stehen dort in den
`.container`-Dateien und in `kontext.env`, `livekit.env` …, die Backup-Werte in `backup.env`.

| Variable | Standard | Wofür |
| --- | --- | --- |
| `KONTEXT_DOMAIN` | – | Adresse von Kontext im Browser; Caddy holt das Zertifikat, Kontext bekommt `https://<…>` als `BETTER_AUTH_URL`, Stalwart als öffentliche Adresse |
| `STALWART_HOSTNAME` | – | Name des Mailservers (MX, Reverse DNS) |
| `MAIL_DOMAIN` | leer | die Mail-Domain: Caddy liefert `mta-sts.<…>` (MTA-STS) und `openpgpkey.<…>` (WKD) |
| `ACME_EMAIL` | – | Adresse für Let's Encrypt |
| `TAILSCALE_IP` | `127.0.0.1` | wo Stalwarts Verwaltung (Port 8080) lauscht; mit Tailscale die Tailscale-Adresse des Servers |
| `KONTEXT_SECRET` | – | Pflicht, mindestens 32 Zeichen; wird zu `BETTER_AUTH_SECRET` |
| `STALWART_ADMIN_KEY` | leer | API-Schlüssel für die [Firmenverwaltung](#firmenverwaltung-einschalten) |
| `KONTEXT_VERSION` | – | Pflicht: Version des Images `tristanteu/kontext` |
| `COMPOSE_PROFILES` | – | `calls` (LiveKit, LiveKit SIP, Redis) und `documents` (Schreibzeug) |
| `LIVEKIT_SECRET` | leer | Geheimnis für LiveKit und LiveKit SIP; leer: keine Anrufe |
| `SCHREIBZEUG_URL` | leer | Adresse von Dokumente; leer: kein Modul |
| `SCHREIBZEUG_CLIENT_SECRET` | leer | Geheimnis, mit dem sich Schreibzeug bei Kontext anmeldet |
| `SCHREIBZEUG_VERSION` | `latest` | Version des Images `tristanteu/schreibzeug` |
| `PLACES_URL` | Photon von komoot | Ortsvorschläge; leer: aus ([Ortsvorschläge](#ortsvorschlage)) |
| `RESTIC_REPOSITORY`, `RESTIC_PASSWORD` | – | Ziel und Passwort der [Backups](#5-backups) |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | – | Schlüssel für ein S3-Ziel |
| `BACKUP_WARN_GB` | `8` | ab dieser Größe des Backups schreibt `backup.sh` eine Warnung |

### Der Kontext-Server

Was der Server selbst liest (`server/env.ts`). `compose.yaml` setzt davon nur die Zeilen unter
`kontext: environment:`; mit Quadlet stehen sie in `kontext.container` und `kontext.env`. Das
Image setzt `PORT=3000`, `STATIC_DIR=/app/dist`, `DATABASE_PATH=/data/kontext.db` und
`NODE_ENV=production`. Die Standardwerte in der Tabelle sind die ohne Image (Entwicklung).

| Variable | Standard | Wofür |
| --- | --- | --- |
| `PORT` | `18090` | Port des Servers (im Image 3000) |
| `STALWART_URL` | `http://127.0.0.1:18080` | Stalwarts HTTP, direkt (in Compose `http://stalwart:8080`) |
| `BETTER_AUTH_URL` | `http://localhost:5173` | öffentliche Adresse von Kontext |
| `BETTER_AUTH_SECRET` | – | Pflicht, mindestens 32 Zeichen, kein `change-me`: signiert die Sitzungen, verschlüsselt die Stalwart-Tokens |
| `DATABASE_PATH` | `.dev/server/kontext.db` | die SQLite-Datenbank (im Image `/data/kontext.db`) |
| `SIGN_IN_PER_MINUTE` | `10` | Anmeldungen je Minute und IP-Adresse |
| `STALWART_ADMIN_KEY` | leer | API-Schlüssel (`API_…`) oder `name:passwort` für die Firmenverwaltung |
| `DOH_URL` | `https://cloudflare-dns.com/dns-query` | DNS-over-HTTPS (JSON-API) für „Sicherheit der Mails“ und die Suche nach S/MIME-Zertifikaten |
| `SMIME_ROOTS` | leer | Pfad zu einer PEM-Datei mit weiteren anerkannten S/MIME-Stellen, etwa der Verwaltungs-PKI; einfacher in der Firmenverwaltung unter „S/MIME-Stellen“ |
| `LIVEKIT_URL` | leer | LiveKits API, wie der Server sie erreicht (in Compose `http://livekit:7880`) |
| `LIVEKIT_API_KEY` | leer | LiveKit-Schlüssel (in Compose `kontext`) |
| `LIVEKIT_API_SECRET` | leer | LiveKit-Geheimnis, mindestens 32 Zeichen; ohne die drei keine Anrufe |
| `LIVEKIT_PUBLIC_URL` | leer | wo Browser LiveKit erreichen, wenn nicht über Kontexts Adresse (`/rtc` über Caddy) |
| `PHONE_SIP_HOST` | Host von `BETTER_AUTH_URL` | wo die Telefonboxen LiveKit SIP erreichen |
| `PHONE_SIP_PORT` | `5060` | SIP-Port (TCP) dafür |
| `SCHREIBZEUG_URL` | leer | Adresse von Schreibzeug; damit gibt es „Dokumente“ |
| `SCHREIBZEUG_CLIENT_ID` | `schreibzeug` | Client-ID von Schreibzeug (dessen `OIDC_CLIENT_ID`) |
| `SCHREIBZEUG_CLIENT_SECRET` | leer | dessen `OIDC_CLIENT_SECRET`, mindestens 32 Zeichen |
| `PLACES_URL` | `https://photon.komoot.io/api/` | Photon für Ortsvorschläge; leer: aus |
| `STATIC_DIR` | leer | die gebaute App; gesetzt, liefert der Server sie mit aus |
| `NODE_ENV` | – | `production` im Image; sonst nimmt der Server Entwicklungswerte (ein festes Geheimnis, Admin und LiveKit aus `dev/config.ts`) |

Nur für Tests: `MAIL_SYNC_ALLOW_PLAIN`, `UNSUBSCRIBE_ANY_TARGET`, `CALENDAR_SUBSCRIBE_ANY_TARGET`, `PUSH_ANY_ENDPOINT`,
`SNOOZE_TICK_MS`, `REMINDER_TICK_MS`, `RULE_TASK_TICK_MS`, `M365_LOGIN_URL` und `GRAPH_URL`
(siehe [Entwicklung](development.md)).

**Variablen, die `compose.yaml` nicht weitergibt** (`DOH_URL`, `SMIME_ROOTS`,
`LIVEKIT_PUBLIC_URL`, `PHONE_SIP_HOST`, `PHONE_SIP_PORT`, `SIGN_IN_PER_MINUTE`): In `.env`
eingetragen kommen sie nicht im Container an. Mit Compose gehören sie als Zeile unter
`kontext: environment:` in `deploy/compose.yaml` – eine lokale Änderung; stößt ein `git pull` auf
dieselbe Stelle, vorher `git stash`, danach `git stash pop`. Eine PEM-Datei für `SMIME_ROOTS` muss
außerdem in den Container:

```yaml
  kontext:
    environment:
      # … die vorhandenen Zeilen
      SMIME_ROOTS: /etc/kontext/smime-roots.pem
      DOH_URL: https://<eigener DoH-Dienst mit JSON-API>/dns-query
    volumes:
      - kontext-data:/data
      - ./smime-roots.pem:/etc/kontext/smime-roots.pem:ro
```

Die Datei liegt dann als `deploy/smime-roots.pem` daneben und muss für den Benutzer `bun` im
Container lesbar sein (`chmod 644`). Mit Quadlet kommen die Variablen in `kontext.env` und die
Datei per `Volume=/opt/kontext/deploy/smime-roots.pem:/etc/kontext/smime-roots.pem:ro` in
`kontext.container`; danach `systemctl daemon-reload` und `systemctl restart kontext`.

## Fehlersuche

Die Logs: `docker compose -f deploy/compose.yaml logs <dienst>` (Compose) bzw.
`podman logs <dienst>` (Quadlet), für die Sicherung `journalctl -u kontext-backup`.

- **Niemand kann sich mehr anmelden, auch mit richtigem Passwort:** Stalwart hat Kontexts Adresse
  gesperrt. Kontext meldet alle von einer Adresse an; ohne den Eintrag **`10.89.250.0/24`** unter
  den erlaubten IPs ([Stalwart einrichten](#3-stalwart-einrichten), Schritt 6) sperrt Stalwart
  sie nach 100 Fehlversuchen am Tag. Den Eintrag nachholen und die Sperre löschen: Stalwart führt
  sie als `BlockedIp` (über die API `x:BlockedIp/get`, dann `x:BlockedIp/set` mit `destroy`;
  Helfer in [VPS einrichten, Schritt 10](vps.md#10-stalwart-ohne-oberflache-einrichten)). Mit
  einer Sperrdauer (Schritt 7) läuft sie von selbst ab.
- **Kein Zertifikat, der Browser warnt:** Caddy holt die Zertifikate beim Start
  (`logs caddy`). Die A-Einträge müssen vorher auf den Server zeigen und dürfen bei Cloudflare
  nicht über den Proxy laufen (siehe [Server und DNS](#1-server-und-dns)); Ports 80 und 443 müssen
  offen sein. Fragte der Server, bevor es die Einträge gab, merkt sich sein Resolver das eine Weile
  ([VPS einrichten, Schritt 7](vps.md#7-dns-bei-cloudflare)).
- **Mails kommen nicht an oder landen im Spam:** Port 25 beim Anbieter freigegeben, Reverse DNS
  gesetzt ([VPS einrichten, Schritt 5](vps.md#5-mail-sperre-aufheben)), SPF, DKIM und DMARC
  gesetzt; die Firmenverwaltung prüft unter „Sicherheit der Mails“, was fehlt. Sperrlisten:
  [VPS einrichten, Schritt 12](vps.md#12-mail-umstellen).
- **„Schreibzeug antwortet nicht“ im Log von Kontext:** Beim ersten Start harmlos, wenn
  Schreibzeug Kontext noch nicht fand ([VPS einrichten, Schritt 9](vps.md#9-kontext-mit-quadlet-starten)).
  Bleibt es, prüfen, ob `SCHREIBZEUG_URL` im DNS steht (`getent hosts dokumente.firma.de` auf dem
  Server) und der Dienst läuft (`logs schreibzeug`).
- **Neue Mails erscheinen erst nach dem Neuladen:** Push braucht eine Verbindung, die ein Proxy
  nicht puffert. Durch den Cloudflare-Proxy geht sie nicht (siehe [Server und DNS](#1-server-und-dns));
  ein eigener Proxy vor Caddy muss `/api/live` und `/jmap/eventsource` ungepuffert und
  unkomprimiert durchreichen, wie es `deploy/Caddyfile` selbst tut.
- **Anrufe ohne Ton oder Bild:** TCP 7881 und UDP 7882 offen, hinter NAT `node_ip` setzen
  ([Anrufe](#anrufe)).
- **Die Telefonbox meldet sich nicht an der Fritzbox an:** siehe [Telefonie](#telefonie), „Wenn die
  Box sich nicht an der Fritzbox anmeldet“; eine Box vor v0.1.4 kann es nicht.
- **„Steuerung auf dem Server nicht eingerichtet“ unter Datensicherung:** die systemd-Units sind
  nicht installiert oder laufen nicht ([Backups](#5-backups)).
- **Weitere Postfächer fehlen in den Einstellungen, Einladungen haben keine Knöpfe:**
  `STALWART_ADMIN_KEY` fehlt ([Firmenverwaltung einschalten](#firmenverwaltung-einschalten)).
  Fehlt nur die Firmenverwaltung, hat das eigene Konto in Stalwart die Rolle
  `Firmenverwaltung (Kontext)` noch nicht (dort Schritt 4).
