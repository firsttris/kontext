/** The Firmenverwaltung's own settings in Kontext's SQLite (Stalwart has no place for them). */
import { eq } from "drizzle-orm";
import type { VacationTemplate } from "../../src/lib/vacation-template";
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
  /** The Pflichtangaben under every mail sent (legal-footer.ts); empty while there are none. */
  legalFooter: () => Promise<string>;
  saveLegalFooter: (text: string) => Promise<void>;
  /** Abmelden nach Inaktivität in minutes (idle-logout.ts); 0 while it is off. */
  idleLogout: () => Promise<number>;
  saveIdleLogout: (minutes: number) => Promise<void>;
  /** The Vorlagen for the out-of-office reply (vacation-templates.ts); none at first. */
  vacationTemplates: () => Promise<VacationTemplate[]>;
  saveVacationTemplates: (templates: VacationTemplate[]) => Promise<void>;
  /** Where „Als Phishing melden“ sends a mail (phishing-report.ts); empty while there is none. */
  phishingReport: () => Promise<string>;
  savePhishingReport: (address: string) => Promise<void>;
  /** The assistant in the chat (assistant.ts): Claude API key and model; the key sealed at rest. */
  assistant: () => Promise<AssistantSetting | null>;
  /** null takes the assistant away. */
  saveAssistant: (setting: AssistantSetting | null) => Promise<void>;
};

export type AssistantSetting = { apiKey: string; model: string };

const SIGNATURE = "signature";
const M365 = "m365";
const LEGAL_FOOTER = "legalFooter";
const IDLE_LOGOUT = "idleLogout";
const VACATION_TEMPLATES = "vacationTemplates";
const PHISHING_REPORT = "phishingReport";
const ASSISTANT = "assistant";

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
    legalFooter: async () => (await read(LEGAL_FOOTER)) ?? "",
    saveLegalFooter: (text) => write(LEGAL_FOOTER, text),
    idleLogout: async () => Number(await read(IDLE_LOGOUT)) || 0,
    saveIdleLogout: (minutes) => write(IDLE_LOGOUT, String(minutes)),
    vacationTemplates: async () => {
      const value = await read(VACATION_TEMPLATES);
      return value ? (JSON.parse(value) as VacationTemplate[]) : [];
    },
    saveVacationTemplates: (templates) => write(VACATION_TEMPLATES, JSON.stringify(templates)),
    phishingReport: async () => (await read(PHISHING_REPORT)) ?? "",
    savePhishingReport: (address) => write(PHISHING_REPORT, address),
    assistant: async () => {
      const value = await read(ASSISTANT);
      return value ? (JSON.parse(await sealer.open(value)) as AssistantSetting) : null;
    },
    saveAssistant: async (setting) =>
      setting
        ? write(ASSISTANT, await sealer.seal(JSON.stringify(setting)))
        : void (await db
            .delete(schema.companySetting)
            .where(eq(schema.companySetting.key, ASSISTANT))),
  };
};
