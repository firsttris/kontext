import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "./menu";

afterEach(cleanup);

const mouse = { pointerType: "mouse", button: 0 };

const Folders = ({ onPick }: { onPick: () => void }) => (
  <MenuRoot>
    <MenuTrigger>Weitere Aktionen</MenuTrigger>
    <MenuContent>
      <MenuItem onSelect={() => undefined}>Antworten</MenuItem>
      <MenuSub>
        <MenuSubTrigger>Verschieben nach …</MenuSubTrigger>
        <MenuSubContent aria-label="Verschieben nach …">
          <MenuItem onSelect={onPick}>Steuerberater</MenuItem>
        </MenuSubContent>
      </MenuSub>
    </MenuContent>
  </MenuRoot>
);

describe("MenuSub", () => {
  it("keeps the submenu open when the mouse leaves its trigger straight for it", () => {
    const onPick = vi.fn();
    render(<Folders onPick={onPick} />);
    fireEvent.pointerDown(screen.getByText("Weitere Aktionen"), mouse);
    const trigger = screen.getByRole("menuitem", { name: "Verschieben nach …" });
    fireEvent.click(trigger);
    const folder = screen.getByRole("menuitem", { name: "Steuerberater" });

    // The pointer goes from the trigger onto the folder in one move: the submenu sits to the left
    // of the menu where the menu is at the right edge, so the move is not "to the right".
    fireEvent.pointerOut(trigger, { ...mouse, relatedTarget: folder });
    fireEvent.pointerOver(folder, { ...mouse, relatedTarget: trigger });
    fireEvent.pointerMove(folder, mouse);

    expect(screen.queryByRole("menu", { name: "Verschieben nach …" })).not.toBeNull();
    fireEvent.click(screen.getByRole("menuitem", { name: "Steuerberater" }));
    expect(onPick).toHaveBeenCalledOnce();
  });

  it("closes the submenu when the mouse goes to another item of the menu", () => {
    render(<Folders onPick={vi.fn()} />);
    fireEvent.pointerDown(screen.getByText("Weitere Aktionen"), mouse);
    fireEvent.click(screen.getByRole("menuitem", { name: "Verschieben nach …" }));
    expect(screen.queryByRole("menu", { name: "Verschieben nach …" })).not.toBeNull();

    fireEvent.pointerMove(screen.getByRole("menuitem", { name: "Antworten" }), mouse);

    expect(screen.queryByRole("menu", { name: "Verschieben nach …" })).toBeNull();
  });
});
