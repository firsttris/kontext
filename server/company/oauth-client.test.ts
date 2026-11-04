import { describe, expect, it } from "vitest";
import { kontextClientStatus, kontextClientWarning } from "./oauth-client";

describe("kontextClientStatus", () => {
  it("is ok when the client kontext allows the scope full", () => {
    expect(
      kontextClientStatus([
        { clientId: "other", scopes: {} },
        { clientId: "kontext", scopes: { full: true } },
      ]),
    ).toBe("ok");
  });

  it("says the client is missing when Stalwart does not know kontext", () => {
    expect(kontextClientStatus([])).toBe("missing");
    expect(kontextClientStatus([{ clientId: "other", scopes: { full: true } }])).toBe("missing");
  });

  it("says the scope is missing for a client made as first-party before Stalwart 1.0.3", () => {
    expect(kontextClientStatus([{ clientId: "kontext" }])).toBe("noFullScope");
    expect(kontextClientStatus([{ clientId: "kontext", scopes: { mail: true } }])).toBe(
      "noFullScope",
    );
    expect(kontextClientStatus([{ clientId: "kontext", scopes: { full: false } }])).toBe(
      "noFullScope",
    );
  });
});

describe("kontextClientWarning", () => {
  it("names what is missing and stays quiet when nothing is", () => {
    expect(kontextClientWarning("ok")).toBeNull();
    expect(kontextClientWarning("missing")).toContain('OAuth-Client "kontext" nicht');
    expect(kontextClientWarning("noFullScope")).toContain('Scope "full"');
  });
});
