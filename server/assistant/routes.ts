/**
 * /api/assistant: the assistant in the chat (agent.ts). GET tells the app whether there is one
 * (only with ANTHROPIC_API_KEY); POST answers the last question of a conversation the app keeps.
 * The tools act with the signed-in person's own Stalwart token, so the assistant sees what they
 * see; like an agent over /mcp it saves drafts but never sends anything.
 */
import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { z } from "zod";
import { INSTRUCTIONS } from "../mcp/server";
import type { ToolContext } from "../mcp/tool";
import { TOOLS } from "../mcp/tools";
import { tokenOrUnavailable, unavailable } from "../stalwart-away";
import { askAssistant, type CreateMessage } from "./agent";

export type AssistantUser = { sessionId: string; userId: string; email: string };

export type AssistantDeps = {
  /** The Messages API, or null while no key is set: then there is no assistant. */
  create: CreateMessage | null;
  model: string;
  userOf: (request: Request) => Promise<AssistantUser | null>;
  grants: { accessToken: (sessionId: string) => Promise<string | null> };
  /** The tools' reader and writer as the holder of this token (server/mcp/routes.ts). */
  contextFor: (token: string, email: string) => ToolContext;
  /** Whether this person may ask once more now (cost); an allowed question is counted. */
  mayAsk: (userId: string) => boolean;
  /** Whether this person's assistant may make one more change now. */
  mayWrite: (userId: string) => boolean;
  now?: () => Date;
};

const askSchema = z.object({
  messages: z
    .array(
      z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(8000) }),
    )
    .min(1)
    .max(40)
    .refine((turns) => turns.at(-1)?.role === "user", "Die letzte Nachricht ist keine Frage."),
});

/** Kontext's own instructions for agents, plus who asks and what day it is. */
export const systemPrompt = (email: string, now: Date) =>
  [
    INSTRUCTIONS,
    `You are the assistant in Kontext's chat, talking with ${email}, who is signed in. Today is ${now.toLocaleDateString("de-DE", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: "Europe/Berlin" })}.`,
    "Answer briefly, in plain text without Markdown (the chat shows text as it is). When you " +
      "saved a draft, an appointment, a contact or a task, say where it is. Ask back when a " +
      "request is unclear instead of guessing a customer or an address.",
  ].join("\n\n");

/** The SDK's messages.create with this key; the SDK retries rate limits and overload itself. */
export const anthropicCreate = (apiKey: string): CreateMessage => {
  const client = new Anthropic({ apiKey });
  return (params) => client.messages.create(params);
};

export const createAssistantRoutes = (deps: AssistantDeps) => {
  const { create, model, userOf, grants, contextFor, mayAsk, mayWrite } = deps;
  const now = deps.now ?? (() => new Date());
  const app = new Hono();

  app.get("/", async (c) => {
    if (!(await userOf(c.req.raw))) return c.json({ error: "Nicht angemeldet" }, 401);
    return c.json({ enabled: create !== null });
  });

  app.post("/", async (c) => {
    const user = await userOf(c.req.raw);
    if (!user) return c.json({ error: "Nicht angemeldet" }, 401);
    if (!create) return c.json({ error: "Kein Assistent eingerichtet" }, 404);
    const parsed = askSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "Keine Frage" }, 400);
    if (!mayAsk(user.userId)) {
      return c.json({ error: "Zu viele Fragen in kurzer Zeit – bitte gleich noch einmal." }, 429);
    }
    const token = await tokenOrUnavailable(grants, user.sessionId);
    if (token === "unavailable") return unavailable();
    if (!token) return c.json({ error: "Nicht angemeldet" }, 401);
    try {
      const answer = await askAssistant(
        {
          create,
          model,
          system: systemPrompt(user.email, now()),
          tools: TOOLS,
          context: contextFor(token, user.email),
          guard: { mayWrite: async () => mayWrite(user.userId), log: async () => undefined },
        },
        parsed.data.messages,
      );
      return c.json(answer);
    } catch (error) {
      if (!(error instanceof Anthropic.APIError)) throw error;
      console.error(`Assistent: ${error.status ?? ""} ${error.message}`);
      return c.json({ error: "Der Assistent antwortet gerade nicht." }, 502);
    }
  });

  return app;
};
