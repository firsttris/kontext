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
    /** Who gave the task its assignee, and when: what the bell shows as "Neu für dich". */
    assignedBy: text("assigned_by"),
    assignedAt: integer("assigned_at", { mode: "timestamp_ms" }),
    /** When to remind the assignee by push; `remindedAt` once that happened. */
    remindAt: integer("remind_at", { mode: "timestamp_ms" }),
    remindedAt: integer("reminded_at", { mode: "timestamp_ms" }),
    /** daily, weekdays, weekly, monthly, yearly: done, it comes again (server/tasks/tasks.ts). */
    repeat: text("repeat"),
    ...timestamps,
  },
  (table) => [
    index("tasks_account").on(table.accountId),
    index("tasks_remind_at").on(table.remindAt),
  ],
);

/** A board's own columns, as JSON; a board without a row has the four built-in ones. */
export const taskBoards = sqliteTable("task_boards", {
  accountId: text("account_id").primaryKey(),
  columns: text("columns").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

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

/**
 * Team chat (server/chat/): the channels, who belongs to the named and direct ones, the messages
 * and up to when each person has read a channel. People are personal account ids.
 */
export const chatChannels = sqliteTable(
  "chat_channels",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    name: text("name"),
    /** The shared mailbox of a mailbox channel: one channel per mailbox. */
    accountId: text("account_id").unique(),
    /** The sorted members of a direct channel: the same people find the same conversation. */
    directKey: text("direct_key").unique(),
    createdBy: text("created_by").notNull(),
    lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [index("chat_channels_kind").on(table.kind)],
);

export const chatMembers = sqliteTable(
  "chat_members",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.memberId] }),
    index("chat_members_member").on(table.memberId),
  ],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    authorId: text("author_id").notNull(),
    text: text("text").notNull(),
    /** JSON: the personal account ids mentioned with @. */
    mentions: text("mentions").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    editedAt: integer("edited_at", { mode: "timestamp_ms" }),
    /** A deleted message keeps its place ("Nachricht gelöscht") but loses its content. */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    /** JSON CallRecord: a call that ended here (server/calls/), else null. */
    call: text("call"),
    /** An answer in the thread of this message (never an answer to an answer). */
    parentId: text("parent_id"),
    /**
     * Text and card titles in lower case as German writes it ("Ö" → "ö"), for the search:
     * SQLite's own LIKE ignores case only for ASCII. Null until filled in at start.
     */
    folded: text("folded"),
  },
  (table) => [
    index("chat_messages_channel").on(table.channelId, table.createdAt),
    index("chat_messages_parent").on(table.parentId, table.createdAt),
  ],
);

/** Reactions to a message: each person each emoji once. */
export const chatReactions = sqliteTable(
  "chat_reactions",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    emoji: text("emoji").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.messageId, table.memberId, table.emoji] })],
);

/** One person's settings for a channel: muted ones count no unread and send no notification. */
export const chatPrefs = sqliteTable(
  "chat_prefs",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    muted: integer("muted", { mode: "boolean" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.memberId] })],
);

export const chatReads = sqliteTable(
  "chat_reads",
  {
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.channelId, table.memberId] })],
);

/**
 * Photos and files of chat messages; the bytes lie in the data directory under `chat-files/`.
 * `messageId` is null between the upload and sending the message.
 */
export const chatFiles = sqliteTable(
  "chat_files",
  {
    id: text("id").primaryKey(),
    channelId: text("channel_id")
      .notNull()
      .references(() => chatChannels.id, { onDelete: "cascade" }),
    messageId: text("message_id").references(() => chatMessages.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    size: integer("size").notNull(),
    /** A small picture of a photo next to it (`<id>.thumb`), made by the app when uploading. */
    hasThumb: integer("has_thumb", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("chat_files_message").on(table.messageId)],
);

/** Mails, tasks and contacts shared in a message; by `ref` and `thread_id` a mail finds its talks. */
export const chatCards = sqliteTable(
  "chat_cards",
  {
    messageId: text("message_id")
      .notNull()
      .references(() => chatMessages.id, { onDelete: "cascade" }),
    channelId: text("channel_id").notNull(),
    position: integer("position").notNull(),
    kind: text("kind").notNull(),
    accountId: text("account_id").notNull(),
    ref: text("ref").notNull(),
    threadId: text("thread_id"),
    party: text("party").notNull(),
    label: text("label").notNull(),
    detail: text("detail").notNull(),
    /** A mail shared as a copy: the chat file with its content, readable without the mailbox. */
    copyId: text("copy_id"),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.position] }),
    index("chat_cards_ref").on(table.ref),
    index("chat_cards_thread").on(table.threadId),
    index("chat_cards_party").on(table.party),
  ],
);

/**
 * Web Push subscriptions of the browsers that switched notifications on (server/push/). Each
 * belongs to the sign-in session it was made in: signing out ends the pushes to that device.
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    endpoint: text("endpoint").primaryKey(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    /** The person's personal account id. */
    memberId: text("member_id").notNull(),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("push_subscriptions_member").on(table.memberId)],
);

/** Mailboxes someone does not want pushes for (e.g. info@ for who only helps out there). */
export const pushMailboxesOff = sqliteTable(
  "push_mailboxes_off",
  {
    memberId: text("member_id").notNull(),
    accountId: text("account_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.memberId, table.accountId] })],
);

/** Text snippets (server/snippets/): standard answers, per account – shared ones for the team. */
export const snippets = sqliteTable(
  "snippets",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (table) => [index("snippets_account").on(table.accountId)],
);

/**
 * Mails put away until a time ("Wiedervorlage", server/snooze/): they wait in the account's
 * snoozed folder and come back to the inbox then. `userId` is whose sign-in brings them back.
 */
export const snoozes = sqliteTable(
  "snoozes",
  {
    accountId: text("account_id").notNull(),
    emailId: text("email_id").notNull(),
    until: integer("until", { mode: "timestamp_ms" }).notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The personal account id of who put it away, told when it is back. */
    by: text("by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.emailId] }),
    index("snoozes_until").on(table.until),
  ],
);
