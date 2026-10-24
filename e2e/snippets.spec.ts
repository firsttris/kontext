import { expect, test } from "@playwright/test";
import { login, unique } from "./helpers";

test.describe("Textbausteine", () => {
  test("legt einen für info@ an, das Team setzt ihn mit dem Namen ein", async ({
    page,
    browser,
  }) => {
    const title = unique("Terminbestätigung");
    await login(page);
    await page.goto("/settings?section=snippets");
    const info = page
      .getByRole("region")
      .filter({ has: page.getByRole("heading", { name: "info@" }) });
    await info.getByRole("button", { name: "Neuer Textbaustein" }).click();
    await info.getByLabel("Titel").fill(title);
    await info.getByLabel("Text").fill("Guten Tag {Name},\n\nwir kommen am Dienstag um 8 Uhr.");
    await info.getByRole("button", { name: "Speichern" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Textbaustein gespeichert." }),
    ).toBeVisible();
    await expect(info.getByRole("list")).toContainText(title);

    const anna = await (await browser.newContext()).newPage();
    await login(anna, "anna");
    await anna.getByRole("link", { name: "info@" }).click();
    await anna.getByRole("link", { name: "Neue Mail" }).first().click();
    await anna
      .getByRole("combobox", { name: "An" })
      .fill("Markus Hoffmann <m.hoffmann@schreinerei-hoffmann.test>");
    await anna.keyboard.press("Enter");
    await anna.getByRole("button", { name: "Textbaustein einfügen" }).click();
    await anna.getByRole("menuitem", { name: title }).click();
    const body = anna.getByRole("textbox", { name: "Ihre Nachricht …" });
    await expect(body).toContainText("Guten Tag Markus Hoffmann,");
    await expect(body).toContainText("wir kommen am Dienstag um 8 Uhr.");
    await anna.context().close();

    // Max does not work in info@: neither the snippets nor the place for them.
    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    await max.goto("/settings?section=snippets");
    await expect(max.getByRole("heading", { name: "Meine Textbausteine" })).toBeVisible();
    await expect(max.getByRole("heading", { name: "info@" })).toHaveCount(0);
    await max.context().close();
  });
});
