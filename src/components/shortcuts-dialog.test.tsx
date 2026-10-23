import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SHORTCUTS } from "@/lib/shortcuts";
import { ShortcutList } from "./shortcuts-dialog";

afterEach(cleanup);

describe("ShortcutList", () => {
  it("shows every shortcut with a German description", () => {
    render(<ShortcutList />);
    for (const heading of ["Allgemein", "Mail", "Kalender", "Kontakte"])
      expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getAllByRole("term")).toHaveLength(SHORTCUTS.length);
    const mail = screen.getByRole("heading", { name: "Mail" }).parentElement!;
    expect(within(mail).getByText("Archivieren")).toBeTruthy();
    // No raw action names slip through.
    for (const term of screen.getAllByRole("term"))
      expect(term.textContent).not.toMatch(/^[a-z][A-Za-z]+$/);
  });
});
