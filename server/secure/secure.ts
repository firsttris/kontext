/**
 * "Vertraulich senden" (docs/encryption.md, building block 4): what a confidential message is and
 * how its code is checked. The code is the second key: the link alone opens nothing. Pure, apart
 * from scrypt for the code.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/** Wrong codes before the page locks; the sender gives a new code to open it again. */
export const MAX_TRIES = 5;
/** How long a message can be opened. */
export const EXPIRY_DAYS = [7, 30, 90] as const;
/** The encrypted content: text, HTML and attachments, base64. */
export const MAX_BYTES = 30 * 1024 * 1024;

export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .transform((code) => code.replace(/[^A-Z0-9]/g, ""))
  .pipe(z.string().min(8).max(32));

export const newMessageSchema = z.object({
  to: z.string().trim().toLowerCase().email().max(254),
  fromName: z.string().max(200),
  fromEmail: z.string().trim().toLowerCase().email().max(254),
  /** AES-GCM, base64: the iv and the encrypted JSON of the content. */
  ciphertext: z
    .string()
    .min(16)
    .max(Math.ceil((MAX_BYTES * 4) / 3) + 100),
  senderKey: z.string().min(50).max(20_000),
  code: codeSchema,
  expiresDays: z
    .number()
    .int()
    .refine((days) => (EXPIRY_DAYS as readonly number[]).includes(days)),
});

export const replySchema = z.object({
  code: codeSchema,
  ciphertext: z
    .string()
    .min(16)
    .max(Math.ceil((MAX_BYTES * 4) / 3) + 100),
});

export const hashCode = (code: string, salt = randomBytes(16).toString("hex")) => ({
  salt,
  hash: scryptSync(code, salt, 32).toString("hex"),
});

export const codeFits = (code: string, salt: string, hash: string): boolean => {
  const tried = scryptSync(code, salt, 32);
  const stored = Buffer.from(hash, "hex");
  return stored.length === tried.length && timingSafeEqual(stored, tried);
};

export type SecureState = "open" | "locked" | "expired";

export const stateOf = (
  message: { failedTries: number; expiresAt: Date },
  now: Date,
): SecureState =>
  message.expiresAt.getTime() <= now.getTime()
    ? "expired"
    : message.failedTries >= MAX_TRIES
      ? "locked"
      : "open";
