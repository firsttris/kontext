/** Settings of the Kontext server, read once from the environment and checked. */
import { z } from "zod";

const schema = z.object({
  /** Where the server listens. */
  PORT: z.coerce.number().default(18090),
  /** Stalwart's HTTP listener, reached directly (not through Caddy). */
  STALWART_URL: z.url().default("http://127.0.0.1:18080"),
  /** The public address of Kontext, e.g. https://kontext.firma.de (cookies, passkeys later). */
  BETTER_AUTH_URL: z.url().default("http://localhost:5173"),
  /** At least 32 random characters; signs the session cookies and encrypts the Stalwart tokens. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** The SQLite file with sessions (and later passkeys). */
  DATABASE_PATH: z.string().default(".dev/server/kontext.db"),
  /** Sign-in attempts per minute and address (the e2e tests sign in far more often). */
  SIGN_IN_PER_MINUTE: z.coerce.number().default(10),
  /**
   * Stalwart key for the Firmenverwaltung: an API key ("API_…") of an admin account, best limited
   * to the account permissions (see docs/installation.md), or "name:password". Without it the
   * Firmenverwaltung is off.
   */
  STALWART_ADMIN_KEY: z.preprocess((v) => v || undefined, z.string().optional()),
  /** Tests only: moves over IMAP may use any port and servers without TLS (the local Stalwart). */
  MAIL_SYNC_ALLOW_PLAIN: z.stringbool().default(false),
  /** Tests only: a stand-in for Microsoft's sign-in and Graph (dev/fake-graph.ts). */
  M365_LOGIN_URL: z.url().default("https://login.microsoftonline.com"),
  GRAPH_URL: z.url().default("https://graph.microsoft.com/v1.0"),
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
