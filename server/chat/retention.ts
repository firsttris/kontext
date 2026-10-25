/**
 * How long the chat keeps messages, as the Firmenverwaltung sets it (company_setting
 * "chat_retention_days", 0 or missing: for ever), and the job that takes out what is older –
 * at start and every hour, with photos and files.
 */
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import { RETENTION_DAYS, retentionCutoff } from "./chat";
import type { MessageStore } from "./messages";

const KEY = "chat_retention_days";

export type ChatRetention = {
  days: () => Promise<number>;
  setDays: (days: number) => Promise<void>;
};

export const createChatRetention = (db: Db): ChatRetention => ({
  days: async () => {
    const [row] = await db
      .select()
      .from(schema.companySetting)
      .where(eq(schema.companySetting.key, KEY));
    const days = Number(row?.value ?? 0);
    return (RETENTION_DAYS as readonly number[]).includes(days) ? days : 0;
  },
  setDays: async (days) => {
    const row = { key: KEY, value: String(days), updatedAt: new Date() };
    await db
      .insert(schema.companySetting)
      .values(row)
      .onConflictDoUpdate({ target: schema.companySetting.key, set: row });
  },
});

export const createChatPruner = ({
  retention,
  messages,
  now = () => new Date(),
}: {
  retention: Pick<ChatRetention, "days">;
  messages: Pick<MessageStore, "prune">;
  now?: () => Date;
}) => {
  let running = false;
  return {
    /** Takes out what is too old; returns how many messages went. */
    tick: async (): Promise<number> => {
      if (running) return 0;
      running = true;
      try {
        const cutoff = retentionCutoff(await retention.days(), now());
        return cutoff ? await messages.prune(cutoff) : 0;
      } finally {
        running = false;
      }
    },
  };
};
