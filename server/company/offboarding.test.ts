import { describe, expect, it } from "vitest";
import { offboardingScript } from "./offboarding";

describe("offboardingScript", () => {
  it("answers once a day and forwards", () => {
    expect(
      offboardingScript({
        forwardTo: "anna@firma.de",
        reply: { subject: "Max ist nicht mehr bei uns", text: 'Bitte an "Anna" \\ Büro.' },
      }),
    ).toBe(
      [
        'require ["vacation"];',
        'vacation :days 1 :subject "Max ist nicht mehr bei uns" "Bitte an \\"Anna\\" \\\\ Büro.";',
        'redirect "anna@firma.de";',
        "",
      ].join("\n"),
    );
  });

  it("forwards only, or nothing", () => {
    expect(offboardingScript({ forwardTo: "anna@firma.de", reply: null })).toBe(
      'redirect "anna@firma.de";\n',
    );
    expect(offboardingScript({ forwardTo: null, reply: null })).toBeNull();
  });
});
