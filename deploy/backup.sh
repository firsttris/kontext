#!/bin/sh
# Nightly backup of one Kontext server to S3 with Restic.
#
# Stalwart keeps everything (mails, calendars, contacts, settings) in its RocksDB volume. For a
# consistent copy the container stops for the few seconds the snapshot takes; senders retry
# delivery, so no mail is lost. Kontext's own SQLite (sessions, the company signature, tasks,
# chat, the progress of moves) is copied while it runs with VACUUM INTO; the chat's photos and
# files, the telephony's greetings, voicemails, faxes and recordings (phone/) and the mails sent
# "Vertraulich" (secure/) are never changed once written, so they go in as they are; uploaded PST
# files are left out.
# Schreibzeug (documents, when it runs) the same way: its SQLite copied with VACUUM INTO, its
# file contents (blobs, named by their hash and never changed) as they are.
#
# Works with Docker Compose (settings in deploy/.env) and with Podman Quadlet (the units in
# /etc/containers/systemd/; settings in deploy/backup.env, since Quadlet has no deploy/.env).
# Run from cron or a systemd timer at night, e.g.:
#   0 3 * * *  /opt/kontext/deploy/backup.sh >> /var/log/kontext-backup.log 2>&1
set -eu
cd "$(dirname "$0")"

if [ -f /etc/containers/systemd/kontext.container ]; then
  settings=backup.env
  # Quadlet names the containers and volumes after the files, without a project prefix.
  run_in() { podman exec -i "$@"; }
  is_running() { systemctl is-active --quiet "$1"; }
  stop() { systemctl stop "$1"; }
  start() { systemctl start "$1"; }
  volume_path() { podman volume inspect -f '{{ .Mountpoint }}' "$1"; }
else
  settings=.env
  compose="docker compose -f compose.yaml"
  run_in() { $compose exec -T "$@"; }
  is_running() { $compose ps --services --status running | grep -qx "$1"; }
  stop() { $compose stop "$1"; }
  start() { $compose start "$1"; }
  volume_path() { docker volume inspect -f '{{ .Mountpoint }}' "kontext_$1"; }
fi
set -a
# shellcheck source=/dev/null
. "./$settings"
set +a

# A backup under the placeholders from .env.example would be readable by anyone.
# The S3 keys only for an S3 target; SFTP (a NAS, a storage box) signs in with an SSH key.
required=RESTIC_PASSWORD
case "${RESTIC_REPOSITORY:-}" in
  s3:*) required="$required AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY" ;;
esac
for name in RESTIC_REPOSITORY $required; do
  eval "value=\${$name:-}"
  case "$value" in
    "" | *change-me*) echo "backup.sh: $name in deploy/$settings setzen (kein Platzhalter)" >&2; exit 1 ;;
  esac
done

data="$(volume_path stalwart-data)"
app="$(volume_path kontext-data)"

restic snapshots >/dev/null 2>&1 || restic init

# A consistent copy of Kontext's database next to it, then only that copy into the backup.
run_in kontext bun -e '
  const { rmSync, mkdirSync } = require("node:fs");
  const { Database } = require("bun:sqlite");
  mkdirSync("/data/backup", { recursive: true });
  rmSync("/data/backup/kontext.db", { force: true });
  new Database(process.env.DATABASE_PATH).exec("VACUUM INTO '"'"'/data/backup/kontext.db'"'"'");
'
mkdir -p "$app/chat-files" "$app/photos" "$app/phone" "$app/secure"
restic backup --tag kontext --host "$KONTEXT_DOMAIN" \
  "$app/backup" "$app/chat-files" "$app/photos" "$app/phone" "$app/secure"

if is_running schreibzeug; then
  documents="$(volume_path schreibzeug-data)"
  run_in schreibzeug bun -e '
    const { rmSync, mkdirSync } = require("node:fs");
    const { Database } = require("bun:sqlite");
    mkdirSync("/data/backup", { recursive: true });
    rmSync("/data/backup/schreibzeug.db", { force: true });
    new Database("/data/schreibzeug.db").exec("VACUUM INTO '"'"'/data/backup/schreibzeug.db'"'"'");
  '
  restic backup --tag schreibzeug --host "$KONTEXT_DOMAIN" \
    "$documents/backup" "$documents/blobs" "$documents/auth-secret"
fi

stop stalwart
trap 'start stalwart' EXIT
restic backup --tag stalwart --host "$KONTEXT_DOMAIN" "$data"
start stalwart
trap - EXIT

# Keep 14 days, 8 weeks, 12 months; Object Lock on the bucket keeps them from being deleted early.
# A file still locked cannot be deleted, so tidying up may fail: that is reported, and the check
# below runs anyway (set -e would otherwise end the script before it).
tidied=ok
for tag in stalwart kontext schreibzeug; do
  restic forget --tag "$tag" --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune ||
    tidied=failed
done
restic check --read-data-subset 1%

# The repository's size after tidying up, against a limit (BACKUP_WARN_GB, default 8): free tiers
# end at 10 GB (Cloudflare R2, Backblaze B2), and a warning before that leaves time to act.
size="$(restic stats --mode raw-data --json | sed -n 's/.*"total_size":\([0-9]*\).*/\1/p')"
limit_gb="${BACKUP_WARN_GB:-8}"
if [ "${size:-0}" -gt $((limit_gb * 1024 * 1024 * 1024)) ]; then
  echo "$(date -Is) backup: $((size / 1024 / 1024)) MB in the repository, more than ${limit_gb} GB" >&2
fi

if [ "$tidied" = ok ]; then
  echo "$(date -Is) backup ok"
else
  echo "$(date -Is) backup ok, tidying up failed (Object Lock longer than 14 days?)" >&2
fi
