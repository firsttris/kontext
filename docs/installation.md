# Installation

Ein Server pro Kunde. Er braucht Docker (oder Podman), eine feste IPv4-Adresse und eine Domain.
Für zehn Benutzer reicht ein kleiner VPS (2 vCPU, 4 GB RAM, 80 GB SSD).

## 1. Server und DNS

Vorher prüfen: Der Anbieter darf Port 25 nicht sperren, und der Reverse-DNS-Eintrag (PTR) der
IP muss sich setzen lassen.

| Eintrag | Name                             | Wert                                                                |
| ------- | -------------------------------- | ------------------------------------------------------------------- |
| A       | `mail.firma.de`                  | IP des Servers                                                      |
| A       | `sekretaer.firma.de`             | IP des Servers                                                      |
| MX      | `firma.de`                       | `10 mail.firma.de`                                                  |
| TXT     | `firma.de`                       | `v=spf1 mx -all`                                                    |
| TXT     | `<selector>._domainkey.firma.de` | DKIM-Schlüssel aus Stalwart                                         |
| TXT     | `_dmarc.firma.de`                | `v=DMARC1; p=none; rua=mailto:dmarc@firma.de` (später `quarantine`) |
| PTR     | IP des Servers                   | `mail.firma.de` (beim Anbieter einstellen)                          |

!!! warning "Cloudflare"
    Liegt das DNS bei Cloudflare, müssen alle Einträge für Mail und Sekretär **„DNS only“**
    sein (graue Wolke). Durch den Cloudflare-Proxy kommen keine Mails und kein JMAP-Push.

## 2. Starten

```bash
git clone https://github.com/firsttris/sekretaer /opt/sekretaer && cd /opt/sekretaer
cp deploy/.env.example deploy/.env
nano deploy/.env                 # Domain, Mailserver-Name, Geheimnis, Tailscale-IP, Backup-Ziel
docker compose -f deploy/compose.yaml up -d
```

Für `SEKRETAER_SECRET` eine lange Zufallszeichenfolge nehmen (`openssl rand -base64 48`); damit
sind die Sitzungen signiert und die Stalwart-Tokens verschlüsselt. Caddy holt das Zertifikat für
`SEKRETAER_DOMAIN` selbst. Mit Podman liegen die Quadlet-Dateien in
`deploy/quadlet/` (nach `/etc/containers/systemd/` kopieren, `systemctl daemon-reload`).

## 3. Stalwart einrichten

Stalwarts eigene Verwaltung ist nur über die Tailscale-Adresse des Servers erreichbar:
`http://<tailscale-ip>:8080`. Beim ersten Start steht das Admin-Passwort im Log
(`docker compose -f deploy/compose.yaml logs stalwart`).

1. **Domain** `firma.de` anlegen, DKIM-Schlüssel erzeugen und als TXT-Eintrag ins DNS.
2. **TLS** für `mail.firma.de` per ACME, am einfachsten mit DNS-01 (Cloudflare-API-Token), weil
   Port 443 bei Caddy liegt.
3. **Benutzer** anlegen (`name@firma.de`) und für gemeinsame Postfächer eine **Gruppe** (z. B.
   `info`) mit den Mitarbeitern als Mitglieder.
4. Caddy als vertrauenswürdigen Proxy eintragen, damit Stalwart die echten IP-Adressen sieht.

Danach unter `https://sekretaer.firma.de` anmelden. Am Handy im Browser „Zum Startbildschirm
hinzufügen“ wählen: Sekretär startet dann wie eine App und bleibt angemeldet.

### Wenn jemand sein Handy mit der Authenticator-App verliert

Mitarbeiter schalten die Anmeldung mit Code selbst unter *Einstellungen → Passwort und Sicherheit*
ein. Geht das Handy verloren, nimmt der Admin in Stalwarts Verwaltung beim Konto unter
*Credentials* den OTP-Eintrag heraus; danach meldet sich der Mitarbeiter wieder nur mit Passwort
an und richtet den Code neu ein.

## 4. Backups

`deploy/backup.sh` sichert Stalwarts Datenvolume mit [Restic](https://restic.net) auf einen
S3-Speicher. Am besten einen Bucket mit **Object Lock** nehmen, dann kann auch ein Angreifer mit
Zugriff auf den Server die Sicherungen nicht löschen (wichtig für GoBD-Archivierung).

```bash
crontab -e
0 3 * * *  /opt/sekretaer/deploy/backup.sh >> /var/log/sekretaer-backup.log 2>&1
```

Der Mailserver hält dafür nachts ein paar Sekunden an; absendende Server versuchen es einfach
erneut. Einmal im Monat eine Wiederherstellung auf einem Testserver üben:
`restic restore latest --target /tmp/restore`.

## 5. Updates

```bash
cd /opt/sekretaer && git pull
docker compose -f deploy/compose.yaml pull && docker compose -f deploy/compose.yaml up -d
```

Vor einem Stalwart-Update mit neuer Hauptversion die `UPGRADING`-Hinweise von Stalwart lesen und
vorher ein Backup machen.
