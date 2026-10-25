# Installation

Ein Server pro Kunde. Er braucht Docker (oder Podman), eine feste IPv4-Adresse und eine Domain.
Für zehn Benutzer reicht ein kleiner VPS (2 vCPU, 4 GB RAM, 80 GB SSD).

## 1. Server und DNS

Vorher prüfen: Der Anbieter darf Port 25 nicht sperren, und der Reverse-DNS-Eintrag (PTR) der
IP muss sich setzen lassen.

| Eintrag | Name                             | Wert                                                                |
| ------- | -------------------------------- | ------------------------------------------------------------------- |
| A       | `mail.firma.de`                  | IP des Servers                                                      |
| A       | `kontext.firma.de`             | IP des Servers                                                      |
| MX      | `firma.de`                       | `10 mail.firma.de`                                                  |
| TXT     | `firma.de`                       | `v=spf1 mx -all`                                                    |
| TXT     | `<selector>._domainkey.firma.de` | DKIM-Schlüssel aus Stalwart                                         |
| TXT     | `_dmarc.firma.de`                | `v=DMARC1; p=none; rua=mailto:dmarc@firma.de` (später `quarantine`) |
| PTR     | IP des Servers                   | `mail.firma.de` (beim Anbieter einstellen)                          |

Dazu für die Verschlüsselung unterwegs ([Konzept](encryption.md)): **MTA-STS** und **TLS-RPT**
verlangen von anderen Mailservern, nur verschlüsselt an `firma.de` zuzustellen, und melden
Probleme. Stalwart zeigt die passenden Einträge unter *Domains → firma.de → DNS-Einträge* an
(`_mta-sts.firma.de`, `mta-sts.firma.de`, `_smtp._tls.firma.de`) und stellt die Richtlinie unter
`https://mta-sts.firma.de` selbst bereit. Mit DNSSEC beim Anbieter kommt **DANE** dazu (ein
TLSA-Eintrag, ebenfalls aus Stalwart). Die Firmenverwaltung prüft, was davon gesetzt ist.

!!! warning "Cloudflare"
    Liegt das DNS bei Cloudflare, müssen alle Einträge für Mail und Kontext **„DNS only“**
    sein (graue Wolke). Durch den Cloudflare-Proxy kommen keine Mails und kein JMAP-Push.

## 2. Starten

```bash
git clone https://github.com/firsttris/kontext /opt/kontext && cd /opt/kontext
cp deploy/.env.example deploy/.env
nano deploy/.env                 # Domain, Mailserver-Name, Geheimnis, Tailscale-IP, Backup-Ziel
docker compose -f deploy/compose.yaml up -d
```

Für `KONTEXT_SECRET` eine lange Zufallszeichenfolge nehmen (`openssl rand -base64 48`); damit
sind die Sitzungen signiert und die Stalwart-Tokens verschlüsselt. Für Anrufe im Chat ebenso
`LIVEKIT_SECRET` setzen und in der Firewall **TCP 7881 und UDP 7882** öffnen (siehe
[Anrufe](#anrufe)). Caddy holt das Zertifikat für
`KONTEXT_DOMAIN` selbst. Mit Podman liegen die Quadlet-Dateien in
`deploy/quadlet/` (nach `/etc/containers/systemd/` kopieren, `systemctl daemon-reload`).

## 3. Stalwart einrichten

Stalwarts eigene Verwaltung ist nur über die Tailscale-Adresse des Servers erreichbar:
`http://<tailscale-ip>:8080`. Beim ersten Start steht das Admin-Passwort im Log
(`docker compose -f deploy/compose.yaml logs stalwart`).

1. **Domain** `firma.de` anlegen, DKIM-Schlüssel erzeugen und als TXT-Eintrag ins DNS.
2. **TLS** für `mail.firma.de` per ACME, am einfachsten mit DNS-01 (Cloudflare-API-Token), weil
   Port 443 bei Caddy liegt.
3. **Firmenverwaltung einschalten** (siehe unten) und das Konto des Chefs anlegen. Weitere
   Mitarbeiter und gemeinsame Postfächer legt der Chef danach selbst in Kontext an.
4. Caddy als vertrauenswürdigen Proxy eintragen, damit Stalwart die echten IP-Adressen sieht.
5. Unter *Suche* die **Standardsprache** auf Deutsch (`de-DE`) stellen. Stalwart bildet damit
   die Wortstämme deutsch, auch bei kurzen Mails, deren Sprache es nicht sicher erkennt.
6. Unter *JMAP* die **gleichzeitigen Anfragen** (`maxConcurrentRequests`) auf 16 stellen.
   Stalwart erlaubt sonst 4 je Person – für alle Tabs und Geräte zusammen; Kontext fragt beim
   Start mehr auf einmal (Ordner jedes Postfachs, Liste, Unterhaltungen), und was darüber liegt,
   lehnt Stalwart ab.

Danach unter `https://kontext.firma.de` anmelden. Am Handy im Browser „Zum Startbildschirm
hinzufügen“ wählen: Kontext startet dann wie eine App und bleibt angemeldet.

### Anrufe

Anrufe und Besprechungen im Chat laufen über LiveKit, das `compose.yaml` mit dem Profil `calls`
startet (`COMPOSE_PROFILES=calls` in `.env`, so in `.env.example`). Dafür braucht es:

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
Einstellungen → Telefonie steht, ob das geklappt hat.

**In der Fritzbox:** Telefonie → Telefoniegeräte → Neues Gerät einrichten → „Telefon (mit und
ohne Anrufbeantworter)“ → „LAN/WLAN (IP-Telefon)“, Name „Kontext“. Benutzername und Kennwort
merken und festlegen, auf welche Rufnummern das Gerät reagiert und mit welcher es anruft. Für
Durchwahlen je Nummer ein weiteres Gerät dieser Art anlegen, das nur auf diese Nummer reagiert
und mit ihr anruft, und es in Kontext unter „Weitere Rufnummern“ eintragen.

**In Kontext:** Einstellungen → Telefonie: Benutzername und Kennwort aus der Fritzbox eintragen,
auswählen, wer klingeln soll, dann „Box koppeln“.

**Die Box:** ein Gerät im Büronetz, das immer läuft – gebrauchter Thin Client (Futro S740,
Wyse 5070), Raspberry Pi mit SSD, der Firmenserver oder ein NAS mit Docker. Am besten per Kabel.

```bash
KONTEXT_URL=https://kontext.firma.de PAIRING_CODE=K7QM-4XPA \
  docker compose -f deploy/box.compose.yaml up -d
```

Mit Podman: `deploy/quadlet/kontext-box.container`. Ohne Code beim Start zeigt die Box auf
`http://<box>:8089` ein Formular für Kontexts Adresse und den Code. Die Box braucht keine offenen
Ports nach außen; sie läuft im Host-Netz (SIP mit der Fritzbox auf 5070, Sprache auf
10000–10200 im LAN).

### Firmenverwaltung einschalten

Unter *Einstellungen → Firma* legt der Chef (oder die Büroleitung) Mitarbeiter und gemeinsame
Postfächer an, setzt Passwörter und die Anmeldung mit Code zurück und sperrt Zugänge. Dafür
braucht der Kontext-Server einen API-Schlüssel von Stalwart, der nur Konten verwalten darf:

1. In Stalwarts Verwaltung eine **Rolle** `Kontext-Server` anlegen: sie erbt die Rolle *User*
   und bekommt dazu die Rechte `sysAccountGet`, `sysAccountQuery`, `sysAccountCreate`,
   `sysAccountUpdate`, `sysRoleGet`, `sysRoleCreate`, `sysDomainGet`, `sysAuthenticationGet`
   und `impersonate`. Mit `impersonate` arbeitet der Server in den Postfächern der Mitarbeiter
   (Abwesenheit, Leserechte für gemeinsame Postfächer); die App zeigt dem Chef dabei nie fremde
   Mails.
2. Ein **Konto** `kontext-server@firma.de` mit dieser Rolle (statt *User*) und einem langen
   Zufallspasswort anlegen.
3. Mit diesem Konto einen **API-Schlüssel** erzeugen (*Credentials → API Key*, Rechte
   *Inherit*). Er beginnt mit `API_`; in `deploy/.env` als `STALWART_ADMIN_KEY` eintragen und
   Kontext neu starten (`docker compose -f deploy/compose.yaml up -d`).
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

## 4. Platte verschlüsseln

Mails, Chat, Aufgaben und Dateien liegen auf der Platte des Servers. Verschlüsselt ist sie
nutzlos für jemanden, der den Server oder eine Platte mitnimmt: beim Einrichten die Datenplatte
mit LUKS verschlüsseln (bei vielen VPS-Anbietern als Option beim Anlegen, sonst eine zweite
Platte mit `cryptsetup luksFormat` und darauf die Docker-Volumes). Den Schlüssel nicht auf dem
Server ablegen, sondern beim Neustart eingeben oder per Netzwerk entsperren (Clevis/Tang).

## 5. Backups

`deploy/backup.sh` sichert mit [Restic](https://restic.net) auf einen S3-Speicher – Restic
verschlüsselt jede Sicherung mit dem Passwort aus `deploy/.env`, der Speicheranbieter sieht nur
Verschlüsseltes; das Passwort gehört zusätzlich an einen sicheren Ort außerhalb des Servers. Gesichert werden Stalwarts
Datenvolume (Mails, Kalender, Kontakte, Konten), eine Kopie der Kontext-Datenbank
(Anmeldungen, Firmen-Signatur, Aufgaben, Chat, Stand der Umzüge) und die Fotos und Dateien aus dem
Chat. Hochgeladene PST-Dateien bleiben draußen. Am besten einen Bucket mit **Object Lock** nehmen, dann kann auch ein Angreifer mit
Zugriff auf den Server die Sicherungen nicht löschen (wichtig für GoBD-Archivierung).

```bash
crontab -e
0 3 * * *  /opt/kontext/deploy/backup.sh >> /var/log/kontext-backup.log 2>&1
```

Der Mailserver hält dafür nachts ein paar Sekunden an; absendende Server versuchen es einfach
erneut. Die Kontext-Datenbank wird im laufenden Betrieb kopiert (`VACUUM INTO`). Einmal im Monat
eine Wiederherstellung auf einem Testserver üben:

```bash
restic restore latest --tag stalwart --target /tmp/restore     # Stalwart
restic restore latest --tag kontext --target /tmp/restore    # Kontext
```

Die Kopie der Kontext-Datenbank (`…/backup/kontext.db`) kommt bei gestopptem Container als
`kontext.db` ins Volume `kontext_kontext-data`, der Ordner `…/chat-files` daneben als
`chat-files`. Fehlt sie, geht nichts in Stalwart verloren: alle melden sich einmal neu an, die
Vorlage der Firmen-Signatur ist neu einzutragen; Aufgaben und Chat sind dann leer.

## 6. Updates

```bash
cd /opt/kontext && git pull
docker compose -f deploy/compose.yaml pull && docker compose -f deploy/compose.yaml up -d
```

Vor einem Stalwart-Update mit neuer Hauptversion die `UPGRADING`-Hinweise von Stalwart lesen und
vorher ein Backup machen.
