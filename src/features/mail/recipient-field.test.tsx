import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EmailAddress } from "@/jmap/types";
import type { Suggestion } from "@/lib/groups";
import { RecipientField } from "./recipient-field";

const petra = { name: "Petra Keller", email: "petra@keller.test" };
const richter = { name: "Bestellannahme Richter", email: "bestellung@richter.test" };
const suggestions: Suggestion[] = [
  { name: "Lieferanten", email: "gruppe:lieferanten", members: [petra, richter] },
  petra,
  richter,
];

const setup = (value: EmailAddress[] = []) => {
  const onChange = vi.fn();
  render(<RecipientField label="An" value={value} onChange={onChange} suggestions={suggestions} />);
  return { onChange, input: screen.getByRole("combobox", { name: "An" }) };
};

afterEach(cleanup);

describe("RecipientField", () => {
  it("suggests contacts while typing and adds the picked one", () => {
    const { onChange, input } = setup();
    fireEvent.change(input, { target: { value: "kel" } });
    const option = screen.getByRole("option", { name: /Petra Keller/ });
    act(() => {
      fireEvent.mouseDown(option);
    });
    expect(onChange).toHaveBeenCalledWith([petra]);
  });

  it("adds all members when a group is picked", () => {
    const { onChange, input } = setup();
    fireEvent.change(input, { target: { value: "liefer" } });
    expect(screen.getByRole("option", { name: /Gruppe · 2 Kontakte/ })).toBeTruthy();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith([petra, richter]);
  });

  it("turns a typed address into a chip and skips the ones already there", () => {
    const { onChange, input } = setup([petra]);
    fireEvent.change(input, { target: { value: "neu@kunde.test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith([petra, { name: null, email: "neu@kunde.test" }]);
    onChange.mockClear();
    fireEvent.change(input, { target: { value: "kel" } });
    expect(screen.queryByRole("option", { name: /Petra Keller/ })).toBeNull();
  });

  it("removes the last chip with backspace in an empty field", () => {
    const { onChange, input } = setup([petra, richter]);
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(onChange).toHaveBeenCalledWith([petra]);
  });
});
