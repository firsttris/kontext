import { describe, expect, it } from "vitest";
import { fillVacationTemplate, type VacationValues } from "./vacation-template";

const values: VacationValues = {
  name: "Tom Krank",
  to: "2026-11-20",
  deputy: { name: "Anna Weber", email: "anna@weber-haustechnik.test" },
  locale: "de-DE",
};

const TEMPLATE = [
  "Vielen Dank für Ihre Nachricht. {Name} ist bis {Bis} nicht im Büro.",
  "",
  "In dringenden Fällen wenden Sie sich bitte an {Vertretung}.",
  "",
  "Freundliche Grüße",
].join("\n");

describe("fillVacationTemplate", () => {
  it("puts in the name, the last day in the language and the deputy", () => {
    expect(fillVacationTemplate(TEMPLATE, values)).toBe(
      [
        "Vielen Dank für Ihre Nachricht. Tom Krank ist bis 20. November 2026 nicht im Büro.",
        "",
        "In dringenden Fällen wenden Sie sich bitte an Anna Weber (anna@weber-haustechnik.test).",
        "",
        "Freundliche Grüße",
      ].join("\n"),
    );
    expect(fillVacationTemplate("Back on {Bis}", { ...values, locale: "en-US" })).toBe(
      "Back on November 20, 2026",
    );
  });

  it("drops a line whose placeholder has no value, and the gap it leaves", () => {
    expect(fillVacationTemplate(TEMPLATE, { ...values, to: "", deputy: null })).toBe(
      "Freundliche Grüße",
    );
    expect(fillVacationTemplate(TEMPLATE, { ...values, deputy: null })).toBe(
      "Vielen Dank für Ihre Nachricht. Tom Krank ist bis 20. November 2026 nicht im Büro.\n\nFreundliche Grüße",
    );
  });

  it("takes the placeholders in any case and leaves other braces as they are", () => {
    expect(fillVacationTemplate("{name}, {BIS}, {Auftrag}", values)).toBe(
      "Tom Krank, 20. November 2026, {Auftrag}",
    );
  });

  it("puts a value in as it is, never as a pattern", () => {
    expect(fillVacationTemplate("{Name}", { ...values, name: "$& {Bis}" })).toBe("$& {Bis}");
  });
});
