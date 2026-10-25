import { expect, test } from "@playwright/test";
import { inboxSubjects, login, unique } from "./helpers";

test.describe("Lesebestätigung", () => {
  test("anfordern, bestätigen, beim Absender sehen", async ({ page, browser }) => {
    const subject = unique("Freigabe Angebot Bad");
    await login(page);
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    const to = page.getByRole("combobox", { name: "An" });
    await to.fill("max");
    await page.getByRole("option", { name: /Max Becker/ }).click();
    await page.getByLabel("Betreff").fill(subject);
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill("Bitte bis Freitag freigeben.");
    const receipt = page.getByRole("button", { name: "Lesebestätigung anfordern" });
    await receipt.click();
    await expect(receipt).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
    await expect.poll(() => inboxSubjects("max")).toContain(subject);

    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    await max.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    const asked = max.getByRole("note").filter({ hasText: "bittet um eine Lesebestätigung" });
    await expect(asked).toContainText("Jonas Weber");
    await asked.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(
      max.getByRole("status").filter({ hasText: "Lesebestätigung an Jonas Weber geschickt." }),
    ).toBeVisible();
    await expect(asked).toHaveCount(0);
    // Asked once: opened again, the question does not come back.
    await max.reload();
    await expect(max.getByRole("heading", { name: subject })).toBeVisible();
    await expect(max.getByText("bittet um eine Lesebestätigung")).toHaveCount(0);

    await page.getByRole("link", { name: "Gesendet" }).click();
    await page.getByRole("list", { name: "Gesendet" }).getByText(subject).click();
    await expect(page.getByRole("note").filter({ hasText: "Gelesen von Max Becker" })).toBeVisible({
      timeout: 15_000,
    });
    await max.context().close();
  });
});
