# shellcheck shell=sh
# What differs between Docker Compose (settings in deploy/.env) and Podman Quadlet (the units in
# /etc/containers/systemd/; settings in deploy/backup.env, since Quadlet has no deploy/.env).
# Sourced from deploy/ by backup.sh and backup-control.sh.
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
  # Compose with Docker or with Podman (podman compose names the volumes the same way).
  volume_path() {
    docker volume inspect -f '{{ .Mountpoint }}' "kontext_$1" 2>/dev/null ||
      podman volume inspect -f '{{ .Mountpoint }}' "kontext_$1"
  }
fi
