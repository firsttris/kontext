# Sekretär: the web app, served by Caddy, which also forwards JMAP to Stalwart.
FROM docker.io/oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY project.inlang ./project.inlang
COPY messages ./messages
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM docker.io/library/caddy:2-alpine
COPY --from=build /app/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
