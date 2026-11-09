/** Shared settings of the local development and test setup. Never used in production. */
export const STALWART_VERSION = "1.0.3";

export const STALWART_ADMIN = { user: "admin", password: "kontext-admin-dev" } as const;

/** Stalwart rejects weak passwords, so the dev users share one long one. */
export const DEV_PASSWORD = "kaffee-werkbank-kontext";

export const DEV_DOMAIN = "weber-haustechnik.test";

/**
 * The storage key the dev Stalwart encrypts mails and files with (STALWART_BLOB_KEY, 32 bytes).
 * btoa, not Buffer: the demo in the browser imports this file too (src/demo/store.ts).
 */
export const DEV_BLOB_KEY = btoa("kontext-dev-storage-key-32-bytes");

/** LiveKit for calls in the chat (dev/livekit.ts): the release and the dev key pair. */
export const LIVEKIT_VERSION = "1.13.11";
export const LIVEKIT_DEV_KEY = {
  key: "kontext-dev",
  secret: "kontext-dev-secret-only-for-local-calls-0123",
} as const;

/** The secret Schreibzeug (or its stand-in, dev/fake-schreibzeug.ts) signs in to Kontext with. */
export const SCHREIBZEUG_DEV_SECRET = "schreibzeug-dev-secret-only-for-local-tests-0123";
