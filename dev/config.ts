/** Shared settings of the local development and test setup. Never used in production. */
export const STALWART_VERSION = "0.16.27";

export const STALWART_ADMIN = { user: "admin", password: "kontext-admin-dev" } as const;

/** Stalwart rejects weak passwords, so the dev users share one long one. */
export const DEV_PASSWORD = "kaffee-werkbank-kontext";

export const DEV_DOMAIN = "weber-haustechnik.test";
