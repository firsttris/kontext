/**
 * Checks in the built image that every import of the server resolves (CI job "app-image"). The
 * image installs the runtime dependencies without peers (docker/Dockerfile); a missing package
 * would otherwise show only when a user first reaches the code that imports it, e.g. the
 * Outlook move. Bun resolves the server and all it imports, down to the last file of each
 * package, without running it; the result stays in memory. dev/ is not in the image: main.ts
 * imports it only outside production.
 *
 *   docker exec -i kontext sh -c 'cat > /tmp/check-imports.ts && bun /tmp/check-imports.ts' < docker/check-imports.ts
 */
const ENTRY = "/app/server/main.ts";

/** `external` takes package names only; a relative path needs a resolver of its own. */
const skipDevConfig: Bun.BunPlugin = {
  name: "skip-dev-config",
  setup: (build) => {
    build.onResolve({ filter: /\/dev\/config$/ }, ({ path }) => ({ path, external: true }));
  },
};

const result = await Bun.build({
  entrypoints: [ENTRY],
  target: "bun",
  packages: "bundle",
  plugins: [skipDevConfig],
  throw: false,
});

for (const log of result.logs) console.log(log.message);
console.log(result.success ? `ok: ${ENTRY} and all its imports` : `missing imports below ${ENTRY}`);
process.exit(result.success ? 0 : 1);

export {};
