// @vitest-environment node
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { WriteGuard } from "../mcp/server";
import { type Tool, type ToolContext, tool } from "../mcp/tool";
import { type AskDeps, askAssistant, MAX_ROUNDS, toolDefinition } from "./agent";

const searchMail = tool({
  name: "search_mail",
  title: "Mails suchen",
  description: "Search mail.",
  scope: "read",
  input: { query: z.string(), limit: z.number().int().default(10) },
  run: async (_context, { query, limit }) => ({ found: [`${query}:${limit}`] }),
}) as unknown as Tool;

const createDraft = tool({
  name: "create_draft",
  title: "Entwurf anlegen",
  description: "Save a draft.",
  scope: "write",
  input: { to: z.string() },
  run: async (_context, { to }) => ({ message: `Entwurf an ${to} liegt in „Entwürfe“.` }),
}) as unknown as Tool;

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

const reply = (stop: Anthropic.StopReason, ...content: Block[]) =>
  ({ role: "assistant", content, stop_reason: stop }) as unknown as Anthropic.Message;

const call = (id: string, name: string, input: unknown): Block => ({
  type: "tool_use",
  id,
  name,
  input,
});

/** A model that gives these replies in turn and keeps what it was asked. */
const scripted = (...replies: Anthropic.Message[]) => {
  const asked: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const create = async (params: Anthropic.MessageCreateParamsNonStreaming) => {
    // The loop changes its list afterwards: keep what was sent at this moment.
    asked.push(structuredClone(params));
    const next = replies.shift();
    if (!next) throw new Error("no more replies");
    return next;
  };
  return { asked, create };
};

const allow: WriteGuard = { mayWrite: async () => true, log: async () => undefined };

const deps = (create: AskDeps["create"], guard: WriteGuard = allow): AskDeps => ({
  create,
  model: "claude-sonnet-5-5",
  system: "Kontext",
  tools: [searchMail, createDraft],
  context: {} as ToolContext,
  guard,
});

const toolResults = (params: Anthropic.MessageCreateParamsNonStreaming) =>
  params.messages.at(-1)?.content as Anthropic.ToolResultBlockParam[];

describe("the assistant", () => {
  it("answers in text, sending the conversation, the instructions and the tools", async () => {
    const model = scripted(reply("end_turn", { type: "text", text: "Hallo Jonas." }));
    const answer = await askAssistant(deps(model.create), [
      { role: "user", text: "Hallo" },
      { role: "assistant", text: "Hallo, was kann ich tun?" },
      { role: "user", text: "Wer bin ich?" },
    ]);
    expect(answer).toEqual({ text: "Hallo Jonas.", done: [], incomplete: false });
    const [params] = model.asked;
    expect(params?.system).toBe("Kontext");
    expect(params?.messages).toEqual([
      { role: "user", content: "Hallo" },
      { role: "assistant", content: "Hallo, was kann ich tun?" },
      { role: "user", content: "Wer bin ich?" },
    ]);
    expect(params?.tools?.map((definition) => (definition as Anthropic.Tool).name)).toEqual([
      "search_mail",
      "create_draft",
    ]);
  });

  it("runs the tools it asks for and sends the results back, with defaults filled in", async () => {
    const model = scripted(
      reply(
        "tool_use",
        { type: "text", text: "Ich suche." },
        call("t1", "search_mail", { query: "Keller" }),
      ),
      reply("end_turn", { type: "text", text: "Eine Mail von Keller." }),
    );
    const answer = await askAssistant(deps(model.create), [{ role: "user", text: "Keller?" }]);
    expect(answer.text).toBe("Eine Mail von Keller.");
    const second = model.asked[1]!;
    expect(second.messages.at(-2)?.role).toBe("assistant");
    expect(toolResults(second)).toEqual([
      {
        type: "tool_result",
        tool_use_id: "t1",
        content: JSON.stringify({ found: ["Keller:10"] }, null, 1),
      },
    ]);
  });

  it("names what it created in the writer's words", async () => {
    const model = scripted(
      reply("tool_use", call("t1", "create_draft", { to: "petra@keller.test" })),
      reply("end_turn", { type: "text", text: "Der Entwurf liegt bereit." }),
    );
    const answer = await askAssistant(deps(model.create), [{ role: "user", text: "Antworte" }]);
    expect(answer.done).toEqual(["Entwurf an petra@keller.test liegt in „Entwürfe“."]);
  });

  it("tells the model about an input that does not fit, without running the tool", async () => {
    const model = scripted(
      reply("tool_use", call("t1", "search_mail", { query: 42 })),
      reply("end_turn", { type: "text", text: "Entschuldigung." }),
    );
    await askAssistant(deps(model.create), [{ role: "user", text: "Suche" }]);
    const [result] = toolResults(model.asked[1]!);
    expect(result).toMatchObject({ tool_use_id: "t1", is_error: true });
    expect(String(result?.content)).toContain("query");
  });

  it("tells the model about an unknown tool", async () => {
    const model = scripted(
      reply("tool_use", call("t1", "send_mail", {})),
      reply("end_turn", { type: "text", text: "Das geht nicht." }),
    );
    await askAssistant(deps(model.create), [{ role: "user", text: "Sende" }]);
    expect(toolResults(model.asked[1]!)).toEqual([
      {
        type: "tool_result",
        tool_use_id: "t1",
        content: "Unbekanntes Werkzeug: send_mail",
        is_error: true,
      },
    ]);
  });

  it("makes no change the guard refuses and does not count it as done", async () => {
    const model = scripted(
      reply("tool_use", call("t1", "create_draft", { to: "petra@keller.test" })),
      reply("end_turn", { type: "text", text: "Später." }),
    );
    const refuse: WriteGuard = { mayWrite: async () => false, log: async () => undefined };
    const answer = await askAssistant(deps(model.create, refuse), [{ role: "user", text: "Los" }]);
    expect(answer.done).toEqual([]);
    expect(toolResults(model.asked[1]!)[0]).toMatchObject({ is_error: true });
  });

  it("runs no tool from a reply that was cut off or refused", async () => {
    for (const stop of ["max_tokens", "refusal"] as const) {
      const model = scripted(
        reply(stop, { type: "text", text: "Ich lege an" }, call("t1", "create_draft", { to: "x" })),
      );
      const answer = await askAssistant(deps(model.create), [{ role: "user", text: "Los" }]);
      expect(answer).toEqual({ text: "Ich lege an", done: [], incomplete: true });
      expect(model.asked).toHaveLength(1);
    }
  });

  it("stops after a bounded number of rounds", async () => {
    const replies = Array.from({ length: MAX_ROUNDS + 1 }, (_, index) =>
      reply("tool_use", call(`t${index}`, "search_mail", { query: "x" })),
    );
    const model = scripted(...replies);
    const answer = await askAssistant(deps(model.create), [{ role: "user", text: "Los" }]);
    expect(answer.incomplete).toBe(true);
    expect(model.asked).toHaveLength(MAX_ROUNDS);
  });
});

describe("a tool for the Messages API", () => {
  it("describes its input as JSON Schema, with defaults optional", () => {
    expect(toolDefinition(searchMail)).toMatchObject({
      name: "search_mail",
      description: "Search mail.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" }, limit: { type: "integer", default: 10 } },
        required: ["query"],
      },
    });
  });
});
