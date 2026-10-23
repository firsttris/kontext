# Sekretär: the app and its server (sign-in, JMAP to Stalwart) in one image, run by Bun.
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
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/dist DATABASE_PATH=/data/sekretaer.db
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY --from=build /app/dist ./dist
COPY server ./server
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD bun -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1))"
CMD ["bun", "server/main.ts"]
