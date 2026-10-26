// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { createFailureLimit } from "../failures";
import { createExternalRoutes, type ExternalDeps } from "./routes";

// Every login is refused (the company's own Stalwart, a colleague's address, guessed passwords).
vi.mock("../migration/imap-source", () => ({
  openImap: vi.fn(async (endpoint: { host: string }) =>
    endpoint.host.startsWith("10.")
      ? { ok: false, error: { reason: "outside", message: "Er liegt nicht im Internet." } }
      : { ok: false, error: { reason: "login", message: "Anmeldung abgelehnt" } },
  ),
}));

const setup = () => {
  const smtp = { check: vi.fn() };
  const failures = createFailureLimit(3, 60_000);
  const app = createExternalRoutes({
    store: { listFor: async () => [] },
    infoOf: async () => ({
      sessionId: "s",
      name: "Jonas",
      accounts: [{ id: "jonas", isPersonal: true, isReadOnly: false }],
    }),
    smtp,
    failures,
  } as unknown as ExternalDeps);
  const add = (imapHost: string, password = "geheim") =>
    app.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "other",
        email: "jonas@privat.test",
        password,
        imapHost,
        smtpHost: imapHost,
      }),
    });
  return { add, smtp };
};

describe("adding a mailbox of another provider", () => {
  it("connects to no server inside the network", async () => {
    const { add, smtp } = setup();
    const response = await add("10.89.250.3");
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: string }).error).toContain("nicht im Internet");
    expect(smtp.check).not.toHaveBeenCalled();
  });
});

describe("guessing a password through the form", () => {
  it("stops after a few wrong ones, on any server", async () => {
    const { add } = setup();
    for (const password of ["a", "b", "c"]) {
      expect(
        ((await (await add("mail.firma.de", password)).json()) as { error: string }).error,
      ).toContain("Anmeldung abgelehnt");
    }
    expect(((await (await add("mail.firma.de", "d")).json()) as { error: string }).error).toContain(
      "Zu viele Fehlversuche",
    );
  });
});
