import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VacationTemplate } from "@/lib/vacation-template";
import { VacationForm } from "./vacation-form";

const templates: { current: VacationTemplate[] } = { current: [] };
vi.mock("@/features/company/vacation-templates", () => ({
  useVacationTemplates: () => templates.current,
}));

afterEach(cleanup);

const colleagues = [
  { id: "anna", name: "Anna Weber", email: "anna@weber-haustechnik.test" },
  { id: "max", name: "Max Brandt", email: "max@weber-haustechnik.test" },
];

const renderForm = () =>
  render(
    <VacationForm
      initial={{ isEnabled: true, from: "", to: "2030-12-18", subject: "", text: "" }}
      onSave={() => {}}
      saving={false}
      name="Jonas Weber"
      colleagues={colleagues}
    />,
  );

const message = () => screen.getByLabelText("Nachricht") as HTMLTextAreaElement;
const choose = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("VacationForm", () => {
  it("names the deputy also with a Vorlage that has no {Vertretung}", () => {
    templates.current = [{ title: "Krank", text: "{Name} ist bis {Bis} krank." }];
    renderForm();
    choose("Vorlage", "0");
    choose("Vertretung", "anna");
    expect(message().value).toContain("Anna Weber (anna@weber-haustechnik.test)");
  });

  it("keeps the deputy picked before a Vorlage without {Vertretung}", () => {
    templates.current = [{ title: "Krank", text: "{Name} ist bis {Bis} krank." }];
    renderForm();
    choose("Vertretung", "anna");
    choose("Vorlage", "0");
    expect(message().value).toContain("Anna Weber (anna@weber-haustechnik.test)");
  });
});
