#!/bin/sh
# Starts Asterisk, then the agent. The manager login is made once and kept in /data; the agent
# writes everything else Asterisk reads from what Kontext sends. If either stops, the container
# ends and its restart policy brings both back.
set -eu

mkdir -p /data
[ -s /data/ami-secret ] || head -c 24 /dev/urandom | base64 | tr -d '/+=\n' > /data/ami-secret
AMI_SECRET=$(cat /data/ami-secret)
export AMI_SECRET

cat > /etc/asterisk/manager.conf <<CONF
[general]
enabled=yes
port=5038
bindaddr=127.0.0.1

[kontext-agent]
secret=${AMI_SECRET}
deny=0.0.0.0/0.0.0.0
permit=127.0.0.1/255.255.255.255
read=system,call,user
write=system,call,originate
CONF
chmod 640 /etc/asterisk/manager.conf
[ -f /etc/asterisk/pjsip.conf ] || : > /etc/asterisk/pjsip.conf
[ -f /etc/asterisk/extensions.conf ] || printf '[general]\nstatic=yes\n' > /etc/asterisk/extensions.conf

asterisk -f &
ASTERISK=$!

# The agent logs in to the manager interface; wait until it listens.
i=0
until nc -z 127.0.0.1 5038 2>/dev/null; do
  i=$((i + 1))
  [ "$i" -gt 100 ] && { echo "Asterisk did not start" >&2; exit 1; }
  kill -0 "$ASTERISK" 2>/dev/null || { echo "Asterisk stopped" >&2; exit 1; }
  sleep 0.2
done

bun /app/agent.js &
AGENT=$!

# Whichever ends first ends the container.
while kill -0 "$ASTERISK" 2>/dev/null && kill -0 "$AGENT" 2>/dev/null; do sleep 2; done
kill "$ASTERISK" "$AGENT" 2>/dev/null || true
exit 1
