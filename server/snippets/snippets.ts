/**
 * Text snippets: standard answers to insert while writing, each for one account – one's own
 * mailbox, or a shared one like info@ for everyone who works in it. Pure.
 */
import { z } from "zod";

export type Snippet = {
  id: string;
  accountId: string;
  title: string;
  /** Plain text; {Vorname} and {Name} become the recipient's when inserted. */
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

/** "Guten Tag {Name}," → "Guten Tag Markus Hoffmann,": the first recipient's name. */
export const fillSnippet = (body: string, recipient: { name?: string | null } | undefined) => {
  const name = recipient?.name?.trim() ?? "";
  const first = name.split(/\s+/)[0] ?? "";
  return body.replace(/\{Vorname\}/g, first).replace(/\{Name\}/g, name);
};
