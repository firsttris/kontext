// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createExternalRoutes, type ExternalDeps } from "./routes";

vi.mock("../migration/imap-source", () => ({
  openImap: vi.fn(async () => ({ ok: false, error: { reason: "connect", message: "refused" } })),
}));

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
    resolve: async (host: string) => (host === "stalwart" ? ["10.89.250.3"] : ["212.227.17.170"]),
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
    const response = await add("stalwart");
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain("nicht im Internet");
    expect(smtp.check).not.toHaveBeenCalled();
  });

  it("tries a server on the internet", async () => {
    const { add } = setup();
    const response = await add("mail.privat.test");
    expect(((await response.json()) as { error: string }).error).toContain(
      "Posteingangsserver antwortet nicht",
    );
  });
});
