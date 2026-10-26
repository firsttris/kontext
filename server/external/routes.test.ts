// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createExternalRoutes, type ExternalDeps } from "./routes";

const setup = () => {
  const smtp = { check: vi.fn() };
  const app = createExternalRoutes({
    store: { listFor: async () => [] },
    infoOf: async () => ({
      sessionId: "s",
      name: "Jonas",
      accounts: [{ id: "jonas", isPersonal: true, isReadOnly: false }],
    }),
    smtp,
  } as unknown as ExternalDeps);
  const add = (imapHost: string) =>
    app.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "other",
        email: "jonas@privat.test",
        password: "geheim",
        imapHost,
        smtpHost: imapHost,
      }),
    });
  return { add, smtp };
};

describe("adding a mailbox of another provider", () => {
  it("connects to no server inside the network", async () => {
    const { add, smtp } = setup();
    // An address inside: no DNS asked, no connection made.
    const response = await add("10.89.250.3");
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain("nicht im Internet");
    expect(smtp.check).not.toHaveBeenCalled();
  });
});
