/** Settings of the Sekretär server, read once from the environment and checked. */
import { z } from "zod";

const schema = z.object({
  /** Where the server listens. */
  PORT: z.coerce.number().default(18090),
  /** Stalwart's HTTP listener, reached directly (not through Caddy). */
  STALWART_URL: z.url().default("http://127.0.0.1:18080"),
  /** The public address of Sekretär, e.g. https://sekretaer.firma.de (cookies, passkeys later). */
  BETTER_AUTH_URL: z.url().default("http://localhost:5173"),
  /** At least 32 random characters; signs the session cookies and encrypts the Stalwart tokens. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** The SQLite file with sessions (and later passkeys). */
  DATABASE_PATH: z.string().default(".dev/server/sekretaer.db"),
  /** Sign-in attempts per minute and address (the e2e tests sign in far more often). */
  SIGN_IN_PER_MINUTE: z.coerce.number().default(10),
  /** The built app (dist/); when set, the server delivers it too. Empty in dev (Vite does). */
  STATIC_DIR: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export const readEnv = (source: Record<string, string | undefined> = process.env): Env => {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new Error(`Einstellungen fehlen oder sind falsch:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
};
