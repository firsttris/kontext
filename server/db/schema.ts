/**
 * The server's own tables. `user`, `session`, `account` and `verification` are Better Auth's
 * core schema for SQLite (https://www.better-auth.com/docs/concepts/database#core-schema);
 * `stalwart_grant` holds the Stalwart tokens of each session, encrypted.
 */
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull(),
  image: text("image"),
  ...timestamps,
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  ...timestamps,
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  ...timestamps,
});

/** Stalwart's OAuth tokens for one browser session, sealed with the server secret. */
export const stalwartGrant = sqliteTable("stalwart_grant", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => session.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  accessExpiresAt: integer("access_expires_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** Settings of the Firmenverwaltung that Stalwart has no place for, e.g. the company signature. */
export const companySetting = sqliteTable("company_setting", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/** A move from another system into one account (e.g. an Outlook PST file), with its progress. */
export const migrationJob = sqliteTable("migration_job", {
  id: text("id").primaryKey(),
  /** The Stalwart account the data goes into. */
  accountId: text("account_id").notNull(),
  accountEmail: text("account_email").notNull(),
  source: text("source", { enum: ["pst"] }).notNull(),
  fileName: text("file_name").notNull(),
  size: integer("size").notNull(),
  received: integer("received").notNull(),
  status: text("status", {
    enum: ["uploading", "queued", "running", "done", "failed"],
  }).notNull(),
  /** JSON: counts per kind (mails, contacts, events): total, imported, skipped, failed. */
  progress: text("progress").notNull(),
  error: text("error"),
  ...timestamps,
});
