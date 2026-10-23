/** The Firmenverwaltung's own settings in Sekretär's SQLite (Stalwart has no place for them). */
import { eq } from "drizzle-orm";
import { type Db, schema } from "../db";
import type { SignatureTemplate } from "./signature";

export type CompanySettings = {
  signature: () => Promise<SignatureTemplate | null>;
  saveSignature: (template: SignatureTemplate) => Promise<void>;
};

const SIGNATURE = "signature";

export const createCompanySettings = (db: Db): CompanySettings => ({
  signature: async () => {
    const [row] = await db
      .select()
      .from(schema.companySetting)
      .where(eq(schema.companySetting.key, SIGNATURE));
    return row ? (JSON.parse(row.value) as SignatureTemplate) : null;
  },
  saveSignature: async (template) => {
    const row = { key: SIGNATURE, value: JSON.stringify(template), updatedAt: new Date() };
    await db
      .insert(schema.companySetting)
      .values(row)
      .onConflictDoUpdate({ target: schema.companySetting.key, set: row });
  },
});
