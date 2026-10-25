import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * The module "Dokumente": Schreibzeug in Kontext's frame, signed in through Kontext's own provider
 * (here its stand-in, dev/fake-schreibzeug.ts, which goes through the real OIDC code flow), and the
 * files between mail and documents (docs/architecture.md#dokumente).
 */

const documentsFrame = (page: Page) => page.frameLocator('iframe[src*="embedded=kontext"]');
const rail = (page: Page) => page.getByRole("navigation", { name: "Apps" }).first();

test.describe("Dokumente", () => {
  test("zeigt Schreibzeug im Rahmen, angemeldet über Kontext", async ({ page }) => {
    await login(page, "anna");
    await rail(page).getByRole("link", { name: "Dokumente" }).click();
    const frame = documentsFrame(page);
    // Signed in without a question, with the name Kontext knows from Stalwart.
    await expect(frame.locator("#who")).toHaveText("Angemeldet als Anna Weber");
    await expect(page).toHaveURL(/\/documents$/);
    await expect(frame.locator("html")).toHaveAttribute("data-theme", /light|dark/);

    // The address follows the frame's page; Kontext's back button goes back there.
    await frame.getByRole("link", { name: "Zuletzt" }).click();
    await expect(page).toHaveURL(/\/documents\/recent$/);
    const loaded = await frame.locator("#loaded").textContent();

    // Changes not saved yet show on the rail, and the frame stays while Mail is open.
    await frame.getByRole("button", { name: "Ändern" }).click();
    await expect(
      rail(page).getByRole("link", { name: "Dokumente, ungespeicherte Änderungen" }),
    ).toBeVisible();
    await rail(page).getByRole("link", { name: "Mail" }).click();
    await expect(page).toHaveURL(/\/mail\//);
    await rail(page)
      .getByRole("link", { name: /Dokumente/ })
      .click();
    await expect(page).toHaveURL(/\/documents\/recent$/);
    await expect(frame.locator("#loaded")).toHaveText(loaded ?? "");
    await frame.getByRole("button", { name: "Speichern" }).click();
    await expect(rail(page).getByRole("link", { name: "Dokumente", exact: true })).toBeVisible();

    // A link into the module opens that page in the frame.
    await page.goto("/documents/edit/42");
    await expect(frame.locator("#path")).toHaveText("/edit/42");
  });

  test("legt einen Anhang in Dokumente ab und hängt ihn an eine neue Mail", async ({ page }) => {
    await login(page);
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    await page
      .getByRole("button", { name: "„Angebot-Wartung-2027.pdf“ in Dokumente ablegen" })
      .click();
    const dialog = page.getByRole("dialog", { name: "In Dokumente ablegen" });
    await dialog.getByRole("button", { name: "Hier ablegen" }).click();
    await expect(
      page.getByText("„Angebot-Wartung-2027.pdf“ liegt jetzt in Dokumente."),
    ).toBeVisible();

    await page.keyboard.press("c");
    await page.getByRole("button", { name: "Aus Dokumente anhängen" }).click();
    await page
      .getByRole("dialog", { name: "Aus Dokumente anhängen" })
      .getByRole("button", { name: "Angebot-Wartung-2027.pdf" })
      .click();
    await expect(
      page.getByRole("list", { name: "Anhänge" }).getByText("Angebot-Wartung-2027.pdf"),
    ).toBeVisible();
  });

  test("meldet Schreibzeug mit Kontext ab", async ({ page }) => {
    await login(page, "sandra");
    await rail(page).getByRole("link", { name: "Dokumente" }).click();
    await expect(documentsFrame(page).locator("#who")).toHaveText(/Angemeldet als/);
    const signedOut = page.waitForResponse(
      (response) => response.url().includes(":28097/logout") && response.status() === 204,
    );
    await rail(page)
      .getByRole("button", { name: /sandra/i })
      .click();
    await page.getByRole("menuitem", { name: "Abmelden" }).click();
    await signedOut;
    await expect(page).toHaveURL(/\/login/);
  });
});
