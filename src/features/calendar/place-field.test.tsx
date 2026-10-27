import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import { PlaceField } from "./place-field";

const PLACES = [
  { label: "Bäckerei Müller, Hauptstraße 5, 79098 Freiburg", lat: 47.99, lon: 7.85 },
  { label: "Bäckerei Müller, Bahnhofstraße 2, 79312 Emmendingen", lat: 48.12, lon: 7.85 },
];
vi.mock("./place-queries", () => ({
  usePlaceSuggestions: (text: string, off: boolean) => (off || text.length < 3 ? [] : PLACES),
}));

afterEach(cleanup);

const Field = () => {
  const [value, setValue] = useState("");
  return <PlaceField value={value} onChange={setValue} />;
};

const typeInto = (text: string) => {
  const field = screen.getByRole("combobox", { name: "Ort" }) as HTMLInputElement;
  fireEvent.focus(field);
  fireEvent.change(field, { target: { value: text } });
  return field;
};

describe("PlaceField", () => {
  it("fills the field with the place picked by mouse", () => {
    render(<Field />);
    const field = typeInto("Bäckerei");
    fireEvent.mouseDown(screen.getByRole("option", { name: /Emmendingen/ }));
    expect(field.value).toBe(PLACES[1]!.label);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("picks with the arrows and Enter, and keeps free text", () => {
    render(<Field />);
    const field = typeInto("Bäckerei");
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "ArrowDown" });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(field.value).toBe(PLACES[1]!.label);
    fireEvent.change(field, { target: { value: "Besprechungsraum 2" } });
    expect(field.value).toBe("Besprechungsraum 2");
  });

  it("keeps typed text on Enter when no place was chosen", () => {
    render(<Field />);
    const field = typeInto("Bäckerei am Markt");
    fireEvent.keyDown(field, { key: "Enter" });
    expect(field.value).toBe("Bäckerei am Markt");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("goes from the last place up with ArrowUp", () => {
    render(<Field />);
    const field = typeInto("Bäckerei");
    fireEvent.keyDown(field, { key: "ArrowUp" });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(field.value).toBe(PLACES[1]!.label);
  });

  it("Escape closes the list, not the dialog", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} title="Neuer Termin">
        <Field />
      </Dialog>,
    );
    const field = typeInto("Bäckerei");
    expect(screen.getByRole("listbox", { name: "Vorschläge für den Ort" })).toBeTruthy();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("asks nothing for a place that was already there", () => {
    render(<PlaceField value="Hauptstraße 5, Freiburg" onChange={vi.fn()} />);
    fireEvent.focus(screen.getByRole("combobox", { name: "Ort" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
