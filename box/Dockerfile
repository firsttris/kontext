# The Kontext telephone box: Asterisk and the box agent in one container, on the host network
# (SIP and RTP with the Fritzbox do not survive container NAT well). Build from the repository root:
#
#   docker build -f box/Dockerfile -t kontext-box .
#   docker run -d --network host -v kontext-box:/data \
#     -e KONTEXT_URL=https://kontext.firma.de -e PAIRING_CODE=K7QM-4XPA kontext-box
FROM docker.io/oven/bun:1.4-alpine AS build
WORKDIR /src
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY server/phone ./server/phone
COPY box/agent ./box/agent
RUN bun build box/agent/main.ts --target=bun --outfile=/out/agent.js

FROM docker.io/oven/bun:1.4-alpine
# Asterisk with PJSIP (Alpine's package); sounds are not needed, nobody hears the box.
RUN apk add --no-cache asterisk tini
COPY box/asterisk/ /etc/asterisk/
COPY box/entrypoint.sh /entrypoint.sh
COPY --from=build /out/agent.js /app/agent.js
ARG BOX_VERSION=dev
ENV BOX_VERSION=$BOX_VERSION DATA_DIR=/data ASTERISK_CONFIG_DIR=/etc/asterisk STATUS_PORT=8089
VOLUME /data
ENTRYPOINT ["/sbin/tini", "--", "/entrypoint.sh"]
