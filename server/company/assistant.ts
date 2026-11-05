/**
 * The assistant in the chat (server/assistant/), set up by the Firmenverwaltung: the company's
 * Claude API key and the model. The key is sealed in company_setting (settings.ts) and never
 * leaves the server again; the form only learns whether there is one and how it ends.
 */
import { Hono } from "hono";
import { z } from "zod";
import { bad, bodyOf, type CompanyDeps, type Env } from "./context";

/** The models one can pick: Sonnet for most, Haiku cheaper, Opus for more demanding questions. */
export const ASSISTANT_MODELS = [
  "claude-sonnet-5-5",
  "claude-haiku-5-5",
  "claude-opus-5-5",
] as const;

const assistantSchema = z.object({
  /** A new key; left out, the saved one stays. */
  apiKey: z.string().trim().min(20).max(400).optional(),
  model: z.enum(ASSISTANT_MODELS),
});

/** What the form shows: the model and the key's last four characters, or nothing set. */
export type AssistantView = { model: string; keyEnd: string } | null;

export const assistantView = (setting: { apiKey: string; model: string } | null): AssistantView =>
  setting ? { model: setting.model, keyEnd: setting.apiKey.slice(-4) } : null;

/** The Firmenverwaltung's routes; behind its check (routes.ts). */
export const assistantRoutes = ({ settings }: CompanyDeps) => {
  const app = new Hono<Env>();
  app.get("/", async (c) => c.json({ assistant: assistantView(await settings.assistant()) }));
  app.put("/", async (c) => {
    const body = await bodyOf(c, assistantSchema);
    if (!body) return bad("Schlüssel oder Modell fehlt.");
    const apiKey = body.apiKey ?? (await settings.assistant())?.apiKey;
    if (!apiKey) return bad("Schlüssel oder Modell fehlt.");
    const setting = { apiKey, model: body.model };
    await settings.saveAssistant(setting);
    return c.json({ assistant: assistantView(setting) });
  });
  app.delete("/", async (c) => {
    await settings.saveAssistant(null);
    return c.json({ assistant: null });
  });
  return app;
};
