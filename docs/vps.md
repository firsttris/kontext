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

Im selben Panel unter *Netzwerk* den **Reverse-DNS** (PTR) der IPv4- und IPv6-Adresse auf den
Namen des Mailservers setzen (`mail.firma.de`); ohne passenden PTR landen Mails schnell im Spam.

Danach weiter mit der [Installation](installation.md).
