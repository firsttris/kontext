#!/bin/sh
# Nightly backup of one Sekretär server to S3 with Restic.
#
# Stalwart keeps everything (mails, calendars, contacts, settings) in its RocksDB volume. For a
# consistent copy the container stops for the few seconds the snapshot takes; senders retry
# delivery, so no mail is lost. Run from cron or a systemd timer at night, e.g.:
#   0 3 * * *  /opt/sekretaer/deploy/backup.sh >> /var/log/sekretaer-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
set -a; . ./.env; set +a

compose="docker compose -f compose.yaml"
volume="$($compose config --format json | grep -o '"sekretaer_stalwart-data"' | head -1 | tr -d '"')"
volume="${volume:-sekretaer_stalwart-data}"
data="$(docker volume inspect -f '{{ .Mountpoint }}' "$volume")"

restic snapshots >/dev/null 2>&1 || restic init

$compose stop stalwart
trap '$compose start stalwart' EXIT
restic backup --tag stalwart --host "$SEKRETAER_DOMAIN" "$data"
$compose start stalwart
trap - EXIT

# Keep 14 days, 8 weeks, 12 months; Object Lock on the bucket keeps them from being deleted early.
restic forget --tag stalwart --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
restic check --read-data-subset 1%
echo "$(date -Is) backup ok"
