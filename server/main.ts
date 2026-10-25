/**
 * Starts the Kontext server.
 *
 *   bun server/main.ts            # dev: http://127.0.0.1:18090, Stalwart on 18080
 */
import { createApp } from "./app";
import { readEnv } from "./env";
import { websocket } from "./phone/setup";

const devAdminKey = async (): Promise<string | undefined> => {
  if (process.env.NODE_ENV === "production") return undefined;
  const { STALWART_ADMIN } = await import("../dev/config");
  return `${STALWART_ADMIN.user}:${STALWART_ADMIN.password}`;
};

/** Development only: the local LiveKit of dev/livekit.ts, so calls work after `bun run dev`. */
const devLiveKit = async (): Promise<Record<string, string>> => {
  if (process.env.NODE_ENV === "production") return {};
  const { LIVEKIT_DEV_KEY } = await import("../dev/config");
  return {
    LIVEKIT_URL: "http://127.0.0.1:17880",
    LIVEKIT_API_KEY: LIVEKIT_DEV_KEY.key,
    LIVEKIT_API_SECRET: LIVEKIT_DEV_KEY.secret,
  };
};

const env = readEnv({
  // Development only: a fixed secret so sessions survive restarts. Production sets its own.
  BETTER_AUTH_SECRET:
    process.env.NODE_ENV === "production"
      ? undefined
      : "dev-secret-only-for-local-development-0123456789",
  // Development only: the local Stalwart's admin for the Firmenverwaltung (dev/ is not in the image).
  STALWART_ADMIN_KEY: await devAdminKey(),
  ...(await devLiveKit()),
  ...process.env,
});
const { app } = await createApp(env);

const server = Bun.serve({ port: env.PORT, fetch: app.fetch, websocket, idleTimeout: 0 });
console.log(`Kontext-Server läuft: http://127.0.0.1:${server.port} → Stalwart ${env.STALWART_URL}`);
