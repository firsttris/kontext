/**
 * Starts the Sekretär server.
 *
 *   bun server/main.ts            # dev: http://127.0.0.1:18090, Stalwart on 18080
 */
import { createApp } from "./app";
import { readEnv } from "./env";

const devAdminKey = async (): Promise<string | undefined> => {
  if (process.env.NODE_ENV === "production") return undefined;
  const { STALWART_ADMIN } = await import("../dev/config");
  return `${STALWART_ADMIN.user}:${STALWART_ADMIN.password}`;
};

const env = readEnv({
  // Development only: a fixed secret so sessions survive restarts. Production sets its own.
  BETTER_AUTH_SECRET:
    process.env.NODE_ENV === "production"
      ? undefined
      : "dev-secret-only-for-local-development-0123456789",
  // Development only: the local Stalwart's admin for the Firmenverwaltung (dev/ is not in the image).
  STALWART_ADMIN_KEY: await devAdminKey(),
  ...process.env,
});
const { app } = await createApp(env);

const server = Bun.serve({ port: env.PORT, fetch: app.fetch, idleTimeout: 0 });
console.log(
  `Sekretär-Server läuft: http://127.0.0.1:${server.port} → Stalwart ${env.STALWART_URL}`,
);
