#!/bin/sh
# Nightly backup of one Kontext server to S3 with Restic.
#
# Stalwart keeps everything (mails, calendars, contacts, settings) in its RocksDB volume. For a
# consistent copy the container stops for the few seconds the snapshot takes; senders retry
# delivery, so no mail is lost. Kontext's own SQLite (sessions, the company signature, tasks,
# chat, the progress of moves) is copied while it runs with VACUUM INTO; the chat's photos and
# files are never changed once written, so they go in as they are; uploaded PST files are left out.
# Schreibzeug (documents, when it runs) the same way: its SQLite copied with VACUUM INTO, its
# file contents (blobs, named by their hash and never changed) as they are.
# Run from cron or a systemd timer at night, e.g.:
#   0 3 * * *  /opt/kontext/deploy/backup.sh >> /var/log/kontext-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
set -a; . ./.env; set +a

compose="docker compose -f compose.yaml"
volume="$($compose config --format json | grep -o '"kontext_stalwart-data"' | head -1 | tr -d '"')"
volume="${volume:-kontext_stalwart-data}"
data="$(docker volume inspect -f '{{ .Mountpoint }}' "$volume")"
app="$(docker volume inspect -f '{{ .Mountpoint }}' kontext_kontext-data)"

restic snapshots >/dev/null 2>&1 || restic init

# A consistent copy of Kontext's database next to it, then only that copy into the backup.
$compose exec -T kontext bun -e '
  const { rmSync, mkdirSync } = require("node:fs");
  const { Database } = require("bun:sqlite");
  mkdirSync("/data/backup", { recursive: true });
  rmSync("/data/backup/kontext.db", { force: true });
  new Database(process.env.DATABASE_PATH).exec("VACUUM INTO '"'"'/data/backup/kontext.db'"'"'");
'
mkdir -p "$app/chat-files"
restic backup --tag kontext --host "$KONTEXT_DOMAIN" "$app/backup" "$app/chat-files"

if $compose ps --services --status running | grep -qx schreibzeug; then
  documents="$(docker volume inspect -f '{{ .Mountpoint }}' kontext_schreibzeug-data)"
  $compose exec -T schreibzeug bun -e '
    const { rmSync, mkdirSync } = require("node:fs");
    const { Database } = require("bun:sqlite");
    mkdirSync("/data/backup", { recursive: true });
    rmSync("/data/backup/schreibzeug.db", { force: true });
    new Database("/data/schreibzeug.db").exec("VACUUM INTO '"'"'/data/backup/schreibzeug.db'"'"'");
  '
  restic backup --tag schreibzeug --host "$KONTEXT_DOMAIN" \
    "$documents/backup" "$documents/blobs" "$documents/auth-secret"
fi

$compose stop stalwart
trap '$compose start stalwart' EXIT
restic backup --tag stalwart --host "$KONTEXT_DOMAIN" "$data"
$compose start stalwart
trap - EXIT

# Keep 14 days, 8 weeks, 12 months; Object Lock on the bucket keeps them from being deleted early.
restic forget --tag stalwart --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
restic forget --tag kontext --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
restic forget --tag schreibzeug --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
restic check --read-data-subset 1%
echo "$(date -Is) backup ok"
