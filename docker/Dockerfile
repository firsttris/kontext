# Kontext: the app and its server (sign-in, JMAP to Stalwart) in one image, run by Bun.
FROM docker.io/oven/bun:1.4 AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY project.inlang ./project.inlang
COPY messages ./messages
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# readpst (libpst) opens Outlook data files for the move (server/migration/pst.ts). Wolfi has no
# package for it, so it is built here from libpst's upstream (pst-format/libpst on GitHub), pinned
# to a commit: 0.6.76 and the fixes since, among them "readpst: Fix a build with gcc/C23 standard"
# (cc600ee), which Wolfi's gcc needs. Only readpst, linked with libpst statically; without the
# Python binding and pst2dii. libgsf is needed because readpst links it for .msg output (-m,
# src/msg.cpp), which Kontext does not use. CI compares its output with Debian's pst-utils.
FROM cgr.dev/chainguard/wolfi-base:latest@sha256:b7787f1d3f29dcfb48730372d3515391ac3b218723201a765c94949922676099 AS readpst
ARG LIBPST_COMMIT=cc600ee98c4ed23b8ab0bc2cf6b6c6e9cb587e89
# The free Wolfi repository; wolfi-base names Chainguard's, which asks for a login.
RUN echo https://packages.wolfi.dev/os > /etc/apk/repositories \
  && apk add --no-cache build-base autoconf automake libtool gettext gettext-dev pkgconf git \
    libgsf-dev zlib-dev
WORKDIR /src
# Checked out by its full hash, so git verifies what is built.
RUN git init -q . && git remote add origin https://github.com/pst-format/libpst \
  && git fetch -q --depth 1 origin "$LIBPST_COMMIT" && git checkout -q FETCH_HEAD \
  && test "$(git rev-parse HEAD)" = "$LIBPST_COMMIT"
# The bootstrap of libpst's Makefile.cvs, without doxygen and the final ./configure.
RUN mkdir -p m4 && autopoint && libtoolize --force --copy && aclocal -I m4 && autoheader \
  && automake --add-missing && autoconf \
  && ./configure --disable-python --disable-dii --enable-libpst-shared=no --enable-static-tools \
    --disable-dependency-tracking \
  && make -C src readpst && install -m 755 src/readpst /usr/local/bin/readpst

# The runtime on Wolfi instead of Debian, as in Haben (firsttris/haben#588): current upstream
# versions and few known vulnerabilities. Wolfi is rolling; the digest keeps the build reproducible
# and Renovate raises it (group "Wolfi").
FROM cgr.dev/chainguard/wolfi-base:latest@sha256:b7787f1d3f29dcfb48730372d3515391ac3b218723201a765c94949922676099
# The same Bun as in the build stage (glibc build); Renovate raises oven/bun at both places.
COPY --from=docker.io/oven/bun:1.4-slim /usr/local/bin/bun /usr/local/bin/bun
COPY --from=readpst /usr/local/bin/readpst /usr/local/bin/readpst
# What readpst and Bun load: libgsf (with glib and libxml2), zlib, libstdc++ for readpst's C++
# part, libgcc. The user "bun" with UID 1000 as in oven/bun's image, so existing volumes stay
# readable.
RUN echo https://packages.wolfi.dev/os > /etc/apk/repositories \
  && apk add --no-cache libgsf zlib libstdc++ libgcc \
  && addgroup -g 1000 bun \
  && adduser -D -u 1000 -G bun -h /home/bun -s /bin/sh bun \
  && readpst -V
WORKDIR /app
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/dist DATABASE_PATH=/data/kontext.db
COPY package.json bun.lock ./
# Without peer dependencies: through them build tools would come into the image (vite, vitest,
# drizzle-kit, esbuild with a Go runtime of its own) that never run there and only add known
# vulnerabilities. What the server imports is checked in the image by docker/check-imports.ts.
RUN bun install --frozen-lockfile --production --ignore-scripts --omit=peer
COPY --from=build /app/dist ./dist
COPY server ./server
# The server uses parts of the app (src/jmap, src/lib) through the "@/" paths of tsconfig.json;
# src comes from the build, with the compiled messages (src/paraglide).
COPY --from=build /app/src ./src
COPY tsconfig.json ./
# Not as root: readpst parses uploaded files, a bug there should not own the container. The image's
# user "bun" owns /data; a new volume takes that over (an older one: docs/installation.md, Updates).
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD bun -e "fetch('http://127.0.0.1:3000/healthz').then(r => process.exit(r.ok ? 0 : 1))"
CMD ["bun", "server/main.ts"]
