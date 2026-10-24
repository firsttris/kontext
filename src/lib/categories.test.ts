import { describe, expect, it } from "vitest";
import {
  addCategory,
  type Category,
  categoriesOn,
  categorySearch,
  changeCategory,
  removeCategory,
} from "./categories";

const list: Category[] = [
  { keyword: "in-bearbeitung", name: "In Bearbeitung", color: "blue" },
  { keyword: "erledigt", name: "Erledigt", color: "green" },
];

describe("categories", () => {
  it("shows the mail's categories in the account's order, unknown keywords left out", () => {
    expect(
      categoriesOn({ erledigt: true, $seen: true, alt: true, "in-bearbeitung": true }, list),
    ).toEqual(list);
    expect(categoriesOn({ $seen: true }, list)).toEqual([]);
  });

  it("adds with an own keyword and a colour not used yet", () => {
    expect(addCategory(list, " Angebot ").at(-1)).toEqual({
      keyword: "angebot",
      name: "Angebot",
      color: "red",
    });
    expect(addCategory(list, "Erledigt").at(-1)?.keyword).toBe("erledigt-2");
  });

  it("renames and recolours by keyword, which stays", () => {
    expect(changeCategory(list, "erledigt", { name: "Fertig", color: "gray" })[1]).toEqual({
      keyword: "erledigt",
      name: "Fertig",
      color: "gray",
    });
    expect(removeCategory(list, "erledigt")).toEqual([list[0]]);
  });

  it("searches a category within its mailbox", () => {
    expect(categorySearch(list[0]!, "info@")).toBe('in:info@ kategorie:"In Bearbeitung"');
  });
});
