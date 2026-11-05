/**
 * The assistant in the chat: Claude with the agents' tools (server/mcp/), acting as the person
 * who asks. One question runs the tool-use loop of the Messages API: the model asks for tools,
 * the server runs them with the person's rights and sends the results back, until the model
 * answers in text (Claude API docs, "Tool use", manual agentic loop).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { runTool, type WriteGuard } from "../mcp/server";
import type { Tool, ToolContext } from "../mcp/tool";

/** One turn of the conversation as the chat keeps it: text only, no tool calls. */
export type Turn = { role: "user" | "assistant"; text: string };

export type Answer = {
  text: string;
  /** What the assistant created or changed, in the words of the writer ("Entwurf an … liegt …"). */
  done: string[];
  /** The model stopped before a full answer: refused, ran out of room or of rounds. */
  incomplete: boolean;
};

/** The one call into the Messages API the loop needs; the SDK's `messages.create` in production. */
export type CreateMessage = (
  params: Anthropic.MessageCreateParamsNonStreaming,
) => Promise<Anthropic.Message>;

export type AskDeps = {
  create: CreateMessage;
  model: string;
  system: string;
  tools: Tool[];
  context: ToolContext;
  guard: WriteGuard;
};

/** Enough for a customer overview plus a draft; a loop that goes on longer has lost its way. */
export const MAX_ROUNDS = 10;
/** Room for thinking (on by default on the 5.5 models) and an answer; below the SDK's limit
 * for a request without streaming. */
const MAX_TOKENS = 16_000;

/** The input as JSON Schema, without the `$schema` line the Messages API has no use for. */
const inputSchema = (tool: Tool): Anthropic.Tool.InputSchema => {
  const { $schema: _, ...schema } = z.toJSONSchema(z.object(tool.input), { io: "input" });
  return schema as Anthropic.Tool.InputSchema;
};

/** A tool as the Messages API describes it; the schema is what an agent over MCP sees too. */
export const toolDefinition = (tool: Tool): Anthropic.Tool => ({
  name: tool.name,
  description: tool.description,
  input_schema: inputSchema(tool),
});

const textOf = (message: Anthropic.Message) =>
  message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("\n")
    .trim();

type ToolOutcome = { result: Anthropic.ToolResultBlockParam; done?: string };

/** Runs one tool call: checked against its schema first, as the MCP SDK does for /mcp. */
const runCall = async (
  call: Anthropic.ToolUseBlock,
  { tools, context, guard }: Pick<AskDeps, "tools" | "context" | "guard">,
): Promise<ToolOutcome> => {
  const failed = (content: string): ToolOutcome => ({
    result: { type: "tool_result", tool_use_id: call.id, content, is_error: true },
  });
  const tool = tools.find((candidate) => candidate.name === call.name);
  if (!tool) return failed(`Unbekanntes Werkzeug: ${call.name}`);
  const input = z.object(tool.input).safeParse(call.input);
  if (!input.success) return failed(z.prettifyError(input.error));
  const answer = await runTool(tool, context, input.data, guard);
  const content = answer.content.map((part) => part.text).join("\n");
  if ("isError" in answer) return failed(content);
  const message =
    tool.scope === "write" ? (JSON.parse(content) as { message?: unknown }).message : undefined;
  return {
    result: { type: "tool_result", tool_use_id: call.id, content },
    ...(typeof message === "string" ? { done: message } : {}),
  };
};

/** Answers the last question of the conversation, using tools as often as the model asks. */
export const askAssistant = async (deps: AskDeps, history: Turn[]): Promise<Answer> => {
  const { create, model, system, tools } = deps;
  const definitions = tools.map(toolDefinition);
  const messages: Anthropic.MessageParam[] = history.map(({ role, text }) => ({
    role,
    content: text,
  }));
  const done: string[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const reply = await create({
      model,
      max_tokens: MAX_TOKENS,
      system,
      tools: definitions,
      messages,
      // The system prompt and the tools stay the same: cached, every round after the first is cheap.
      cache_control: { type: "ephemeral" },
      // Looking things up and drafting needs no deep reasoning; less effort, fewer tokens.
      output_config: { effort: "medium" },
    });
    const calls = reply.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    // A refusal or max_tokens can cut a tool call off: only a finished request for tools is run.
    if (reply.stop_reason !== "tool_use" || calls.length === 0) {
      return { text: textOf(reply), done, incomplete: reply.stop_reason !== "end_turn" };
    }
    messages.push({ role: "assistant", content: reply.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    // One after the other: a draft may need what a lookup in the same turn found.
    for (const call of calls) {
      const outcome = await runCall(call, deps);
      results.push(outcome.result);
      if (outcome.done) done.push(outcome.done);
    }
    messages.push({ role: "user", content: results });
  }
  return { text: "", done, incomplete: true };
};
