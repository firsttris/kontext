import { expect, test } from "@playwright/test";
import { addMail, address, login, unique } from "./helpers";
import { deliverMail } from "./protocols";

test.describe("Übertragung", () => {
  test("zeigt, ob eine Mail verschlüsselt ankam; intern nichts", async ({ page }) => {
    const plain = unique("Ohne TLS");
    const inside = unique("Von innen");
    // The test server takes mail without TLS: like a sender that does not encrypt.
    await deliverMail({
      from: "alt@example.test",
      fromName: "Alter Server",
      to: address("sandra"),
      subject: plain,
      body: "Hallo",
    });
    await addMail("sandra", "sandra", inside);
    await login(page, "sandra");
    await page.getByRole("list", { name: "Posteingang" }).getByText(plain).click();
    await expect(page.getByText("Unverschlüsselt übertragen")).toBeVisible();
    await page.getByRole("list", { name: "Posteingang" }).getByText(inside).click();
    await expect(page.getByRole("heading", { name: inside })).toBeVisible();
    await expect(page.getByText(/verschlüsselt übertragen/i)).toHaveCount(0);
  });
});

test.describe("Firmenverwaltung: Sicherheit der Mails", () => {
  test("zeigt je Domain, was fehlt, und was zu tun ist", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=company-security");
    // The tests look nothing up on the internet: nothing is set.
    const domain = page.getByRole("region", { name: "weber-haustechnik.test" });
    await expect(domain.getByRole("listitem").filter({ hasText: /^MTA-STS/ })).toContainText(
      "Andere Mailserver dürfen unverschlüsselt an euch zustellen",
    );
    await expect(domain.getByRole("img", { name: "Fehlt" }).first()).toBeVisible();
    await expect(page.getByRole("list", { name: "Kontext" })).toContainText("nicht über HTTPS");
  });
});
