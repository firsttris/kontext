import { describe, expect, it } from "vitest";
import { claudeCodeCommand, mcpAddress } from "./api";

describe("agent setup", () => {
  it("names the address and the command for Claude Code", () => {
    expect(mcpAddress("https://mail.weber.de")).toBe("https://mail.weber.de/mcp");
    expect(claudeCodeCommand("https://mail.weber.de", "kontext_abc")).toBe(
      'claude mcp add --transport http kontext https://mail.weber.de/mcp --header "Authorization: Bearer kontext_abc"',
    );
  });
});
