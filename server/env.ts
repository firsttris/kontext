/** Settings of the Kontext server, read once from the environment and checked. */
import { z } from "zod";

/**
 * A secret of at least 32 characters that is no placeholder: deploy/.env.example's
 * "change-me-…" is long enough, and with it the sessions, Stalwart's tokens or the calls would
 * hang on a value anyone can read on GitHub.
 */
const secret = () =>
  z
    .string()
    .min(32)
    .refine((value) => !/change-me/i.test(value), {
      message: "noch der Platzhalter aus .env.example – `openssl rand -base64 48`",
    });

const optional = <T extends z.ZodType>(type: T) =>
  z.preprocess((v) => v || undefined, type.optional());

const schema = z.object({
  /** Where the server listens. */
  PORT: z.coerce.number().default(18090),
  /** Stalwart's HTTP listener, reached directly (not through Caddy). */
  STALWART_URL: z.url().default("http://127.0.0.1:18080"),
  /** The public address of Kontext, e.g. https://kontext.firma.de (cookies, passkeys later). */
  BETTER_AUTH_URL: z.url().default("http://localhost:5173"),
  /** At least 32 random characters; signs the session cookies and encrypts the Stalwart tokens. */
  BETTER_AUTH_SECRET: secret(),
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
  /** DNS-over-HTTPS for the check of the domains' mail security (JSON API). */
  DOH_URL: z.url().default("https://cloudflare-dns.com/dns-query"),
  /**
   * More authorities whose S/MIME certificates count as trusted, besides those Bun brings
   * (Mozilla's list): a PEM file, e.g. the root of the Verwaltungs-PKI.
   */
  SMIME_ROOTS: z.preprocess((v) => v || undefined, z.string().optional()),
  /** Tests only: one-click unsubscribe to any address, inside the network, any certificate. */
  UNSUBSCRIBE_ANY_TARGET: z.stringbool().default(false),
  /** Tests only: push to any address, not only to the browsers' push services. */
  PUSH_ANY_ENDPOINT: z.stringbool().default(false),
  /** How often due Wiedervorlagen are brought back; tests make it short. */
  SNOOZE_TICK_MS: z.coerce.number().int().min(100).default(60_000),
  /** How often task reminders are looked for; tests make it short. */
  REMINDER_TICK_MS: z.coerce.number().int().min(100).default(60_000),
  /** How often mails a rule marked become tasks; tests make it short. */
  RULE_TASK_TICK_MS: z.coerce.number().int().min(100).default(60_000),
  /** Tests only: a stand-in for Microsoft's sign-in and Graph (dev/fake-graph.ts). */
  M365_LOGIN_URL: z.url().default("https://login.microsoftonline.com"),
  GRAPH_URL: z.url().default("https://graph.microsoft.com/v1.0"),
  /**
   * LiveKit for calls in the chat: its API as the Kontext server reaches it (http://livekit:7880),
   * and the key and secret both use (the secret at least 32 characters). Without them calls are off.
   */
  LIVEKIT_URL: z.preprocess((v) => v || undefined, z.url().optional()),
  LIVEKIT_API_KEY: z.preprocess((v) => v || undefined, z.string().optional()),
  LIVEKIT_API_SECRET: optional(secret()),
  /** Where browsers reach LiveKit, if not through Kontext's own address (/rtc via Caddy). */
  LIVEKIT_PUBLIC_URL: z.preprocess((v) => v || undefined, z.url().optional()),
  /**
   * Telephony: where the telephone boxes reach LiveKit SIP – the server's public name (default:
   * the host of BETTER_AUTH_URL) and SIP port (TCP).
   */
  PHONE_SIP_HOST: z.preprocess((v) => v || undefined, z.string().optional()),
  PHONE_SIP_PORT: z.coerce.number().default(5060),
  /**
   * Schreibzeug, the documents: where browsers reach it (https://dokumente.firma.de). With it Kontext
   * shows the module "Dokumente"; with the client secret too, Schreibzeug signs in through Kontext.
   */
  SCHREIBZEUG_URL: z.preprocess((v) => v || undefined, z.url().optional()),
  SCHREIBZEUG_CLIENT_ID: z.string().min(1).default("schreibzeug"),
  /** The secret Schreibzeug sends with the code (its OIDC_CLIENT_SECRET), at least 32 characters. */
  SCHREIBZEUG_CLIENT_SECRET: optional(secret()),
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
