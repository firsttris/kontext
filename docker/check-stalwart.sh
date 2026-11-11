#!/bin/bash
# Starts Stalwart's image hardened as in deploy/compose.yaml and checks that it still takes mail:
# read-only except its volumes and /tmp, all capabilities dropped but NET_BIND_SERVICE, no new
# privileges. Stalwart runs as uid 2000 and binds ports below 1024 through a file capability on
# its binary (`setcap cap_net_bind_service=+ep` in its Dockerfile); without that capability in the
# container's bounding set the kernel refuses to run the binary at all ("exec ... operation not
# permitted"), and the script checks that too, so the exception stays needed and documented.
#
# The listeners on the real mail ports are created as dev/stalwart.ts does: a first start in
# recovery mode (crates/store/src/registry/local.rs), then x:NetworkListener/set.
#
#   docker/check-stalwart.sh <image>
set -euo pipefail
image=$1
admin="admin:check-stalwart-0123456789"
hardening=(--read-only --tmpfs /tmp --cap-drop ALL --cap-add NET_BIND_SERVICE
  --security-opt no-new-privileges:true)
volumes=(-v check-stalwart-config:/etc/stalwart -v check-stalwart-data:/var/lib/stalwart)

cleanup() {
  docker rm -f check-stalwart >/dev/null 2>&1 || true
  docker volume rm check-stalwart-config check-stalwart-data >/dev/null 2>&1 || true
}
trap 'docker logs check-stalwart 2>&1 | tail -n 30 || true; cleanup' EXIT
cleanup

wait_for_jmap() {
  for _ in $(seq 1 120); do
    curl -fsS -o /dev/null -u "$admin" http://127.0.0.1:18480/jmap/session && return 0
    sleep 1
  done
  echo "Stalwart did not answer on port 8080" >&2
  return 1
}

# Only the datastore lives in config.json (UPGRADING/v0_16.md in stalwartlabs/stalwart)
docker run --rm -u 0 "${volumes[@]}" --entrypoint sh "$image" -c \
  'echo "{\"@type\":\"RocksDb\",\"path\":\"/var/lib/stalwart\"}" > /etc/stalwart/config.json &&
   chown -R 2000:2000 /etc/stalwart /var/lib/stalwart'

docker run -d --name check-stalwart "${hardening[@]}" "${volumes[@]}" -p 18480:8080 \
  -e STALWART_RECOVERY_ADMIN="$admin" -e STALWART_RECOVERY_MODE=1 \
  -e STALWART_RECOVERY_MODE_PORT=8080 "$image" >/dev/null
wait_for_jmap
listener() { echo "\"$1\":{\"name\":\"$1\",\"protocol\":\"$2\",\"bind\":{\"0.0.0.0:$3\":true},\"useTls\":false}"; }
answer=$(curl -fsS -u "$admin" -H 'content-type: application/json' http://127.0.0.1:18480/jmap/ -d \
  "{\"using\":[\"urn:ietf:params:jmap:core\",\"urn:stalwart:jmap\"],\"methodCalls\":[[\"x:NetworkListener/set\",{\"create\":{$(listener http http 8080),$(listener smtp smtp 25),$(listener submission smtp 587),$(listener imaps imap 993)}},\"0\"]]}")
if ! grep -q '"created"' <<<"$answer" || grep -q '"notCreated"' <<<"$answer"; then
  echo "creating the listeners failed: $answer" >&2
  exit 1
fi
docker stop -t 20 check-stalwart >/dev/null
docker rm check-stalwart >/dev/null

# The normal start, hardened, with the mail ports
docker run -d --name check-stalwart "${hardening[@]}" "${volumes[@]}" -p 18480:8080 -p 18425:25 \
  -e STALWART_RECOVERY_ADMIN="$admin" "$image" >/dev/null
wait_for_jmap
# Listening sockets in the container, by port (hex in /proc/net/tcp, state 0A = LISTEN)
listening=$(docker exec check-stalwart awk 'NR > 1 && $4 == "0A" { split($2, a, ":"); print a[2] }' /proc/net/tcp)
for port in 25 587 993 8080; do
  if grep -qx "$(printf '%04X' "$port")" <<<"$listening"; then
    echo "ok     port $port listens"
  else
    echo "FAILED port $port does not listen" >&2
    exit 1
  fi
done
greeting=$(timeout 30 bash -c 'exec 3<>/dev/tcp/127.0.0.1/18425; IFS= read -r -t 25 line <&3; echo "$line"' | tr -d '\r')
if [[ $greeting == 220* ]]; then
  echo "ok     SMTP on port 25: $greeting"
else
  echo "FAILED SMTP on port 25 answered: '$greeting'" >&2
  exit 1
fi
docker rm -f check-stalwart >/dev/null

# Counter-check: without NET_BIND_SERVICE the binary does not start at all
docker run -d --name check-stalwart --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true "${volumes[@]}" "$image" >/dev/null
sleep 5
if docker logs check-stalwart 2>&1 | grep -q "operation not permitted"; then
  echo "ok     without NET_BIND_SERVICE the binary is refused, as expected"
else
  echo "FAILED without NET_BIND_SERVICE Stalwart did not fail as expected; is the exception still needed?" >&2
  exit 1
fi
