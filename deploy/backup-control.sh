#!/bin/sh
# The host's side of the Datensicherung in Kontext's Firmenverwaltung. Kontext runs in its
# container without access to the host, to Restic or to the keys; it only writes its wishes into
# its data volume (backup-control/settings.json, backup-control/run-now) and reads what this
# script writes there (status.json, log.txt). Everything Kontext writes is treated as untrusted:
# only a time matching HH:MM and true/false are taken from it, and nothing from it reaches a
# shell command or a unit file unchecked.
#
#   backup-control.sh install   copies the units from deploy/systemd/ to /etc/systemd/system
#   backup-control.sh apply     (kontext-backup-control.service) settings to the timer, run-now
#   backup-control.sh run       (kontext-backup.service) backup.sh under flock, with the status
#   backup-control.sh finish    (its ExecStopPost) the status after the run, also when killed
#   backup-control.sh status    writes status.json again
set -eu
cd "$(dirname "$0")"
deploy="$(pwd)"
. ./backup-host.sh

# Other places only for the tests (backup-control.test.ts).
state="${KONTEXT_BACKUP_STATE:-/var/lib/kontext-backup}"
lock="$state/run.lock"
units="${KONTEXT_BACKUP_UNITS:-/etc/systemd/system}"
dropin="$units/kontext-backup.timer.d/time.conf"
default_time=03:00
# The time as Kontext shows it, whatever zone the server runs in (src/lib/format.ts, TIME_ZONE).
zone=Europe/Berlin
app="$(volume_path kontext-data)"
control="$app/backup-control"
mkdir -p "$state"

# The control directory belongs to Kontext's user (it writes there); a link is not followed.
control_dir() {
  if [ -L "$control" ]; then
    echo "backup-control: $control ist ein Link, wird nicht benutzt" >&2
    exit 1
  fi
  if [ ! -d "$control" ]; then
    mkdir -p "$control"
    chown --reference="$app" "$control"
  fi
}

# Writes stdin to a file in the control directory: beside it first, then renamed over it (also
# over a link or file Kontext put there, never into a directory of that name).
publish() {
  control_dir
  tmp="$(mktemp "$control/.host.XXXXXX")"
  cat >"$tmp"
  chmod 644 "$tmp"
  mv -fT "$tmp" "$control/$1"
}

json_string() {
  printf '"%s"' "$(printf '%s' "$1" | tr -d '\000-\037' | sed 's/\\/\\\\/g; s/"/\\"/g')"
}

json_or_null() {
  if [ -n "$1" ]; then json_string "$1"; else printf null; fi
}

saved() { cat "$state/$1" 2>/dev/null || true; }
save() { printf '%s\n' "$2" >"$state/$1"; }
now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# A name for the target without anything secret: kind, host and bucket or path, no user.
target_name() {
  repo="$(set -a && . "./$settings" >/dev/null 2>&1 && printf '%s' "${RESTIC_REPOSITORY:-}")" || true
  case "$repo" in
    s3:*)
      url="${repo#s3:}"
      url="${url#*://}"
      host="${url%%/*}"
      host="${host##*@}"
      bucket="${url#*/}"
      bucket="${bucket%%/*}"
      case "$host" in
        *r2.cloudflarestorage.com) echo "Cloudflare R2 ($bucket)" ;;
        *backblazeb2.com) echo "Backblaze B2 ($bucket)" ;;
        *) echo "S3 $host/$bucket" ;;
      esac
      ;;
    sftp:*) echo "SFTP ${repo#sftp:*@}" ;;
    rest:*)
      url="${repo#rest:}"
      url="${url#*://}"
      host="${url%%/*}"
      echo "REST ${host##*@}"
      ;;
    "") echo "" ;;
    *:*) echo "${repo%%:*}" ;;
    *) echo "Verzeichnis $repo" ;;
  esac
}

warn_gb() {
  value="$(set -a && . "./$settings" >/dev/null 2>&1 && printf '%s' "${BACKUP_WARN_GB:-8}")" || true
  case "$value" in
    "" | *[!0-9]*) echo 8 ;;
    *) echo "$value" ;;
  esac
}

timer_enabled() { systemctl is-enabled --quiet kontext-backup.timer 2>/dev/null; }

timer_time() {
  set_time="$(sed -n 's/^OnCalendar=\*-\*-\* \([0-2][0-9]:[0-5][0-9]\):00 .*$/\1/p' "$dropin" 2>/dev/null)" ||
    true
  echo "${set_time:-$default_time}"
}

# The timer's next run in UTC, empty while it is off.
next_run() {
  systemctl is-active --quiet kontext-backup.timer || return 0
  next="$(systemctl show kontext-backup.timer -p NextElapseUSecRealtime --value --timestamp=unix 2>/dev/null ||
    systemctl show kontext-backup.timer -p NextElapseUSecRealtime --value)" || return 0
  [ -n "$next" ] && date -u -d "$next" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || true
}

backup_state() {
  case "$(systemctl is-active kontext-backup.service 2>/dev/null)" in
    active | activating) echo running ;;
    *) echo idle ;;
  esac
}

write_status() {
  run_state="${1:-$(backup_state)}"
  start="$(saved start)"
  if [ -n "$start" ]; then
    last_run="$(printf '{"start":%s,"end":%s,"ok":%s,"message":%s}' \
      "$(json_string "$start")" "$(json_or_null "$(saved end)")" \
      "$([ "$(saved ok)" = true ] && echo true || echo false)" \
      "$(json_string "$(saved message | cut -c1-300)")")"
  else
    last_run=null
  fi
  size="$(saved size)"
  if timer_enabled; then enabled=true; else enabled=false; fi
  printf '{"state":"%s","updatedAt":"%s","lastRun":%s,"sizeBytes":%s,"warnGb":%s,"nextRun":%s,"target":%s,"schedule":{"enabled":%s,"time":"%s"}}\n' \
    "$run_state" "$(now)" "$last_run" "${size:-null}" "$(warn_gb)" \
    "$(json_or_null "$(next_run)")" "$(json_string "$(target_name)")" "$enabled" "$(timer_time)" |
    publish status.json
}

publish_log() {
  tail -n 200 "$state/run.log" 2>/dev/null | publish log.txt
}

# settings.json from Kontext: only a regular file, only the first 4 KB, only checked values.
apply_settings() {
  file="$control/settings.json"
  [ -f "$file" ] && [ ! -L "$file" ] || return 0
  json="$(head -c 4096 "$file" | tr -d '\000-\037')"
  if printf '%s' "$json" | grep -Eq '"enabled"[[:space:]]*:[[:space:]]*true'; then
    enabled=true
  elif printf '%s' "$json" | grep -Eq '"enabled"[[:space:]]*:[[:space:]]*false'; then
    enabled=false
  else
    return 0
  fi
  time="$(printf '%s' "$json" | sed -n 's/.*"time"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"
  printf '%s' "$time" | grep -Eqx '([01][0-9]|2[0-3]):[0-5][0-9]' || time="$(timer_time)"

  changed=false
  if [ "$time" != "$(timer_time)" ]; then
    mkdir -p "$(dirname "$dropin")"
    printf '[Timer]\nOnCalendar=\nOnCalendar=*-*-* %s:00 %s\n' "$time" "$zone" >"$dropin.tmp"
    mv -f "$dropin.tmp" "$dropin"
    systemctl daemon-reload
    changed=true
  fi
  if [ "$enabled" = true ]; then
    if ! timer_enabled || ! systemctl is-active --quiet kontext-backup.timer; then
      systemctl enable --now kontext-backup.timer
    elif [ "$changed" = true ]; then
      systemctl restart kontext-backup.timer
    fi
  elif timer_enabled || systemctl is-active --quiet kontext-backup.timer; then
    systemctl disable --now kontext-backup.timer
  fi
}

apply() {
  control_dir
  apply_settings
  if [ -e "$control/run-now" ] || [ -L "$control/run-now" ]; then
    rm -rf -- "$control/run-now"
    systemctl start --no-block kontext-backup.service
  fi
  write_status
}

# backup.sh under the lock (never two at once, also not with one started by hand), its output
# to the journal and to log.txt; afterwards how it went.
run() {
  save start "$(now)"
  rm -f "$state/end" "$state/rc"
  : >"$state/run.log"
  write_status running
  publish_log
  {
    code=0
    flock --nonblock --conflict-exit-code 75 "$lock" ./backup.sh 2>&1 || code=$?
    echo "$code" >"$state/rc"
  } | tee "$state/run.log"
  finish
}

# Also after a run that was killed: without an exit code it counts as aborted.
finish() {
  if [ -n "$(saved start)" ] && [ -z "$(saved end)" ]; then
    rc="$(saved rc)"
    save end "$(now)"
    if [ "$rc" = 0 ]; then save ok true; else save ok false; fi
    message="$(grep -v '^[[:space:]]*$' "$state/run.log" 2>/dev/null | grep -v 'backup size:' | tail -n 1)"
    case "$rc" in
      "") message="Abgebrochen (${SERVICE_RESULT:-ohne Exit-Code}). $message" ;;
      75) message="Übersprungen: Eine andere Sicherung lief gerade." ;;
    esac
    save message "$message"
    size="$(sed -n 's/.*backup size: \([0-9][0-9]*\) bytes.*/\1/p' "$state/run.log" | tail -n 1)"
    [ -n "$size" ] && save size "$size"
  fi
  write_status idle
  publish_log
}

install_units() {
  for unit in systemd/*; do
    sed -e "s|@DEPLOY@|$deploy|g" -e "s|@CONTROL@|$control|g" "$unit" >"$units/$(basename "$unit")"
  done
  systemctl daemon-reload
  control_dir
  write_status
  echo "Installiert. Weiter mit:"
  echo "  systemctl enable --now kontext-backup.timer kontext-backup-control.path"
}

case "${1:-}" in
  install) install_units ;;
  apply) apply ;;
  run) run ;;
  finish) finish ;;
  status) write_status ;;
  *)
    echo "Aufruf: $0 install|apply|run|finish|status" >&2
    exit 2
    ;;
esac
