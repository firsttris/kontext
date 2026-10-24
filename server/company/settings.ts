/** The Firmenverwaltung's own settings in Sekretär's SQLite (Stalwart has no place for them). */
import { eq } from "drizzle-orm";
import type { Sealer } from "../crypto";
import type { Db } from "../db";
import * as schema from "../db/schema";
import type { M365Credentials } from "../migration/m365/graph";
import type { SignatureTemplate } from "./signature";

export type CompanySettings = {
  signature: () => Promise<SignatureTemplate | null>;
  saveSignature: (template: SignatureTemplate) => Promise<void>;
  /** The company's Microsoft 365 app for the move; the secret is sealed at rest. */
  m365: () => Promise<M365Credentials | null>;
  saveM365: (credentials: M365Credentials) => Promise<void>;
};

const SIGNATURE = "signature";
const M365 = "m365";

export const createCompanySettings = (db: Db, sealer: Sealer): CompanySettings => {
  const read = async (key: string): Promise<string | null> => {
    const [row] = await db
      .select()
      .from(schema.companySetting)
      .where(eq(schema.companySetting.key, key));
    return row?.value ?? null;
  };
  const write = async (key: string, value: string) => {
    const row = { key, value, updatedAt: new Date() };
    await db
      .insert(schema.companySetting)
      .values(row)
      .onConflictDoUpdate({ target: schema.companySetting.key, set: row });
  };

  return {
    signature: async () => {
      const value = await read(SIGNATURE);
      return value ? (JSON.parse(value) as SignatureTemplate) : null;
    },
    saveSignature: (template) => write(SIGNATURE, JSON.stringify(template)),
    m365: async () => {
      const value = await read(M365);
      return value ? (JSON.parse(await sealer.open(value)) as M365Credentials) : null;
    },
    saveM365: async (credentials) => write(M365, await sealer.seal(JSON.stringify(credentials))),
  };
};
