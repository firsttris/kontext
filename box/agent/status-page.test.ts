import { describe, expect, it } from "vitest";
import { statusPage } from "./status-page";

describe("statusPage", () => {
  it("asks for Kontext's address and the code before pairing", () => {
    const html = statusPage({ version: "1.0", paired: false, kontextUrl: null, state: null });
    expect(html).toContain('<form method="post" action="/pair">');
    expect(html).toContain('name="code"');
  });

  it("shows the connection and the Fritzbox once paired, without markup from outside", () => {
    const html = statusPage({
      version: "1.0",
      paired: true,
      kontextUrl: "https://kontext.firma.de",
      state: {
        connected: true,
        registered: false,
        detail: "<script>Rejected",
        configVersion: 1,
        error: null,
      },
    });
    expect(html).toContain("verbunden (https://kontext.firma.de)");
    expect(html).toContain("&#60;script&#62;Rejected");
    expect(html).not.toContain("<form");
  });
});
