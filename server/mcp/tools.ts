/**
 * All tools, and those a connection may use: read tools always, write tools with the "write"
 * right (see docs/architecture.md, "Agenten (MCP)").
 */
import type { Scope } from "./connections";
import { READ_TOOLS } from "./read-tools";
import type { Tool } from "./tool";
import { WRITE_TOOLS } from "./write-tools";

export { customerTerms } from "./read-tools";

export const TOOLS = [...READ_TOOLS, ...WRITE_TOOLS] as Tool[];

export const toolsFor = (scopes: readonly Scope[]): Tool[] =>
  TOOLS.filter((tool) => scopes.includes(tool.scope));
