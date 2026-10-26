// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createAuth, type Grants } from "./auth";
import type { Db } from "./db";
import { readEnv } from "./env";

vi.mock("./db", async () => ({
  schema: { ...(await import("./db/schema")), ...(await import("./db/oauth-schema")) },
}));

// Jonas' password is right; his account wants a second factor.
vi.mock("./stalwart", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./stalwart")>()),
  loginAtStalwart: async (_url: string, body: { password: string; code?: string }) => {
    if (body.password === "stalwart-down") return { status: "unavailable" };
    if (body.password !== "right") return { status: "failed" };
    if (!body.code) return { status: "mfa" };
    return { status: "failed" }; // every code tried here is wrong
  },
}));

const env = readEnv({
  BETTER_AUTH_SECRET: "x".repeat(48),
  BETTER_AUTH_URL: "https://kontext.test",
  SIGN_IN_PER_MINUTE: "1000",
});
const auth = createAuth(env, {} as Db, {} as Grants, async () => "");

const signIn = (body: Record<string, string>) =>
  auth.handler(
    new Request("https://kontext.test/api/auth/sign-in/stalwart", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://kontext.test" },
      body: JSON.stringify({ email: "jonas@weber-haustechnik.test", ...body }),
    }),
  );

describe("the per-login limit and the second factor", () => {
  it("stops guessing codes after ten wrong ones, also when the password is sent in between", async () => {
    const statuses: number[] = [];
    for (let round = 0; round < 3; round++) {
      // Nine wrong codes ...
      for (let i = 0; i < 9; i++) {
        statuses.push((await signIn({ password: "right", code: String(100000 + i) })).status);
      }
      // ... then the password alone, which answers "mfa" and clears the count.
      await signIn({ password: "right" });
    }
    // 27 wrong codes in a row reached Stalwart; the limit is 10 per login.
    expect(statuses.every((status) => status === 401 || status === 429)).toBe(true);
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(0);
  });

  it("stops eleven wrong codes in a row", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      statuses.push(
        (await signIn({ email: "anna@weber-haustechnik.test", password: "right", code: "111111" }))
          .status,
      );
    }
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("the per-login limit while Stalwart is away", () => {
  it("counts nothing against the person and says to try again", async () => {
    const as = (password: string) =>
      auth.handler(
        new Request("https://kontext.test/api/auth/sign-in/stalwart", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "https://kontext.test" },
          body: JSON.stringify({ email: "sandra@weber-haustechnik.test", password }),
        }),
      );
    for (let i = 0; i < 12; i++) expect((await as("stalwart-down")).status).toBe(503);
    expect((await as("wrong")).status).toBe(401);
  });
});
