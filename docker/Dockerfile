# Kontext: the app and its server (sign-in, JMAP to Stalwart) in one image, run by Bun.
FROM docker.io/oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY project.inlang ./project.inlang
COPY messages ./messages
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM docker.io/oven/bun:1.4-slim
WORKDIR /app
# readpst (libpst) opens Outlook data files for the move (server/migration/pst.ts).
RUN apt-get update && apt-get install -y --no-install-recommends pst-utils \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/dist DATABASE_PATH=/data/kontext.db
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY --from=build /app/dist ./dist
COPY server ./server
# The server uses parts of the app (src/jmap, src/lib) through the "@/" paths of tsconfig.json;
# src comes from the build, with the compiled messages (src/paraglide).
COPY --from=build /app/src ./src
COPY tsconfig.json ./
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD bun -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1))"
CMD ["bun", "server/main.ts"]
