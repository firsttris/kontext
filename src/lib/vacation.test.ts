import { describe, expect, it } from "vitest";
import { toVacation, toVacationForm, withDeputy } from "./vacation";

describe("vacation form", () => {
  it("keeps the last day inclusive both ways", () => {
    const vacation = toVacation({
      isEnabled: true,
      from: "2026-11-02",
      to: "2026-11-06",
      subject: " Urlaub ",
      text: "Bin weg.",
    });
    expect(vacation.subject).toBe("Urlaub");
    expect(vacation.htmlBody).toContain("Bin weg.");
    expect(toVacationForm(vacation)).toMatchObject({ from: "2026-11-02", to: "2026-11-06" });
  });
});

describe("withDeputy", () => {
  const anna = { name: "Anna Weber", email: "anna@firma.de" };

  it("adds, replaces and removes the deputy's line", () => {
    const added = withDeputy("Ich bin bis Freitag nicht im Büro.", anna);
    expect(added).toBe(
      "Ich bin bis Freitag nicht im Büro.\n\nIn dringenden Fällen wenden Sie sich bitte an Anna Weber (anna@firma.de).",
    );
    expect(withDeputy(added, { name: "Max", email: "max@firma.de" })).toContain(
      "an Max (max@firma.de).",
    );
    expect(withDeputy(added, null)).toBe("Ich bin bis Freitag nicht im Büro.");
  });

  it("writes only the line into an empty message", () => {
    expect(withDeputy("", anna)).toBe(
      "In dringenden Fällen wenden Sie sich bitte an Anna Weber (anna@firma.de).",
    );
  });
});
