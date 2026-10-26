// @vitest-environment node
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { limitBody } from "./body-limit";

describe("limitBody", () => {
  it("refuses a larger body before the route reads it", async () => {
    const read = vi.fn();
    const app = new Hono().put("/", limitBody(10), async (c) => {
      read(await c.req.arrayBuffer());
      return c.body(null, 204);
    });
    const put = (body: string) => app.request("/", { method: "PUT", body });
    expect((await put("x".repeat(11))).status).toBe(413);
    expect(read).not.toHaveBeenCalled();
    expect((await put("x".repeat(10))).status).toBe(204);
  });
});
