/**
 * Text snippets: standard answers to insert while writing, each for one account – one's own
 * mailbox, or a shared one like info@ for everyone who works in it. Pure.
 */
import { z } from "zod";

export type Snippet = {
  id: string;
  accountId: string;
  title: string;
  /** Plain text with placeholders, filled when inserted (src/lib/snippet-fill.ts). */
  body: string;
  createdBy: string;
  updatedAt: string;
};

export const snippetSchema = z.object({
  accountId: z.string().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(10_000),
});

export const snippetPatchSchema = snippetSchema.omit({ accountId: true }).partial();
