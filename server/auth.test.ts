// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createAuth, DISABLED_PATHS, type Grants } from "./auth";
import type { Db } from "./db";
import { readEnv } from "./env";

// The tables without bun:sqlite, which Vitest's Node does not have.
vi.mock("./db", async () => ({
  schema: { ...(await import("./db/schema")), ...(await import("./db/oauth-schema")) },
}));

const env = readEnv({
  BETTER_AUTH_SECRET: "x".repeat(48),
  BETTER_AUTH_URL: "https://kontext.test",
});
// Disabled routes answer before anything reaches the database.
const auth = createAuth(env, {} as Db, {} as Grants, async () => "");

describe("Better Auth's own routes", () => {
  it("are off where they would change a person or hand out tokens", async () => {
    for (const path of DISABLED_PATHS) {
      const response = await auth.handler(
        new Request(`https://kontext.test/api/auth${path}`, {
          method: path === "/token" ? "GET" : "POST",
          headers: { "content-type": "application/json", origin: "https://kontext.test" },
          body: path === "/token" ? undefined : JSON.stringify({ name: "Chef" }),
        }),
      );
      expect(response.status, path).toBe(404);
    }
  });
});
