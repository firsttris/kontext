/**
 * The server's own tables. `user`, `session`, `account` and `verification` are Better Auth's
 * core schema for SQLite (https://www.better-auth.com/docs/concepts/database#core-schema);
 * `stalwart_grant` holds the Stalwart tokens of each session, encrypted.
 */
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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

/** A move from an uploaded file into one account (Outlook PST, vCard, iCalendar), with progress. */
export const migrationJob = sqliteTable("migration_job", {
  id: text("id").primaryKey(),
  /** The Stalwart account the data goes into. */
  accountId: text("account_id").notNull(),
  accountEmail: text("account_email").notNull(),
  /** The uploaded file: Outlook data file, contacts (vCard) or calendar (iCalendar). */
  source: text("source", { enum: ["pst", "vcf", "ics"] }).notNull(),
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

/** A running move from another mailbox over IMAP (Gmail, GMX, …), synced until it is finished. */
export const mailSync = sqliteTable("mail_sync", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  accountEmail: text("account_email").notNull(),
  provider: text("provider").notNull(),
  host: text("host").notNull(),
  port: integer("port").notNull(),
  /** The old address, the IMAP login. */
  login: text("login").notNull(),
  /** The (app) password, sealed with the server secret. */
  secret: text("secret").notNull(),
  status: text("status", { enum: ["active", "running", "login-failed", "finished"] }).notNull(),
  /** JSON: per old folder its UIDVALIDITY and the last UID taken over. */
  state: text("state").notNull(),
  /** JSON: imported, added (already there, one more folder), failed. */
  counts: text("counts").notNull(),
  lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  ...timestamps,
});

/**
 * The mail categories of one Stalwart account (own or shared mailbox): names, colours and order
 * as JSON. The mails carry only the keyword (RFC 8621 keywords); Stalwart has no place for the rest.
 */
export const mailCategories = sqliteTable("mail_categories", {
  accountId: text("account_id").primaryKey(),
  categories: text("categories").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Tasks (src/features/tasks/): each belongs to one Stalwart account – the own mailbox or a shared
 * one like info@ – and whoever can open that account sees it. `status` is the board column,
 * `position` the order within it; the checklist is JSON.
 */
export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    title: text("title").notNull(),
    notes: text("notes").notNull(),
    status: text("status").notNull(),
    position: real("position").notNull(),
    /** The personal account id of the person responsible, or null. */
    assigneeId: text("assignee_id"),
    /** YYYY-MM-DD, and HH:MM when the task is due at a time. */
    dueDate: text("due_date"),
    dueTime: text("due_time"),
    checklist: text("checklist").notNull(),
    createdBy: text("created_by").notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [index("tasks_account").on(table.accountId)],
);

/** What a task is about: a mail (with its thread), a contact, an appointment. */
export const taskLinks = sqliteTable(
  "task_links",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    accountId: text("account_id").notNull(),
    ref: text("ref").notNull(),
    /** The mail's thread, so every mail of the conversation shows the task. */
    threadId: text("thread_id"),
    /** A snapshot to show without loading the mail, e.g. its subject and sender. */
    label: text("label").notNull(),
    detail: text("detail").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.kind, table.ref] }),
    index("task_links_ref").on(table.ref),
  ],
);
