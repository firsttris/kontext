/** What each person entered for the company signature, in Kontext's SQLite (Stalwart has no field). */
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import { NO_DETAILS, type SignatureDetails } from "./signature";

export type SignatureDetailsStore = {
  of: (memberId: string) => Promise<SignatureDetails>;
  save: (memberId: string, details: SignatureDetails) => Promise<void>;
};

export const createSignatureDetails = (db: Db): SignatureDetailsStore => ({
  of: async (memberId) => {
    const [row] = await db
      .select()
      .from(schema.signatureDetail)
      .where(eq(schema.signatureDetail.memberId, memberId));
    return row
      ? { phone: row.phone, mobile: row.mobile, position: row.position, department: row.department }
      : NO_DETAILS;
  },
  save: async (memberId, details) => {
    const row = { memberId, ...details, updatedAt: new Date() };
    await db
      .insert(schema.signatureDetail)
      .values(row)
      .onConflictDoUpdate({ target: schema.signatureDetail.memberId, set: row });
  },
});
