import { expect, test } from "@playwright/test";
import { DEV_PASSWORD } from "../dev/config";
import { totp } from "../src/lib/totp";
import { address, inboxMails, jmapAs, login, unique } from "./helpers";

test.describe("Einstellungen", () => {
  test("Signatur erscheint in neuen Mails", async ({ page }) => {
    await login(page, "sandra");
    await page.goto("/settings?section=signature");
    const editor = page.getByRole("textbox", { name: `Signatur ${address("sandra")}` });
    await editor.click();
    await page.keyboard.type("Sandra Klein · Weber Haustechnik");
    await page.getByRole("button", { name: "Speichern" }).first().click();
    await expect(page.getByRole("status").filter({ hasText: "Gespeichert." })).toBeVisible();

    await page.getByRole("link", { name: "Mail", exact: true }).first().click();
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await expect(page.getByRole("textbox", { name: "Ihre Nachricht …" })).toContainText(
      "Sandra Klein · Weber Haustechnik",
    );
  });

  test("Abwesenheitsnotiz antwortet automatisch", async ({ page, browser }) => {
    await login(page, "max");
    await page.goto("/settings?section=vacation");
    await page.getByLabel("Abwesenheitsnotiz einschalten").check();
    await page.getByLabel("Betreff").fill("Bin im Urlaub");
    await page.getByLabel("Nachricht", { exact: true }).fill("Ab Montag wieder da.");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status").filter({ hasText: "eingeschaltet" })).toBeVisible();

    const anna = await (await browser.newContext()).newPage();
    await login(anna, "anna");
    const subject = unique("Frage Lager");
    await anna.getByRole("link", { name: "Neue Mail" }).first().click();
    await anna.getByRole("combobox", { name: "An" }).fill(address("max"));
    await anna.keyboard.press("Enter");
    await anna.getByLabel("Betreff").fill(subject);
    await anna.getByRole("button", { name: "Senden", exact: true }).click();
    await expect
      .poll(
        async () => (await inboxMails("anna")).some((mail) => mail.subject === "Bin im Urlaub"),
        {
          timeout: 20_000,
        },
      )
      .toBe(true);
  });

  test("App auf diesem Gerät: installieren und als Mailprogramm verwenden", async ({ page }) => {
    await login(page, "anna");
    await page.goto("/settings?section=appearance");
    const card = page.locator("section").filter({ hasText: "App auf diesem Gerät" });
    // Headless Chromium offers no install prompt: the card says how to install instead.
    await expect(card).toContainText("App installieren");
    await card.getByRole("button", { name: "Als Mailprogramm verwenden" }).click();
    await expect(card).toContainText("Der Browser fragt jetzt nach");
  });

  test("ändert das Passwort", async ({ page }) => {
    const next = "werkbank-kaffee-neues-passwort";
    await login(page, "max");
    await page.goto("/settings?section=security");
    await page.getByLabel("Aktuelles Passwort").first().fill("falsch-falsch-falsch");
    await page.getByLabel("Neues Passwort", { exact: true }).fill(next);
    await page.getByLabel("Neues Passwort wiederholen").fill(next);
    await page.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(page.getByRole("alert")).toHaveText("Das aktuelle Passwort stimmt nicht.");

    const changed = page.getByRole("status").filter({ hasText: "Passwort geändert." });
    await page.getByLabel("Aktuelles Passwort").first().fill(DEV_PASSWORD);
    await page.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(changed).toBeVisible();
    // The next change's message must not be mistaken for this one.
    await expect(changed).toBeHidden({ timeout: 10_000 });

    // still signed in with the new password; and back, so the other tests can sign in as Max
    await page.getByLabel("Aktuelles Passwort").first().fill(next);
    await page.getByLabel("Neues Passwort", { exact: true }).fill(DEV_PASSWORD);
    await page.getByLabel("Neues Passwort wiederholen").fill(DEV_PASSWORD);
    await page.getByRole("button", { name: "Passwort ändern" }).click();
    await expect(changed).toBeVisible();
    await expect
      .poll(() =>
        jmapAs("max")
          .getSession()
          .then(
            () => true,
            () => false,
          ),
      )
      .toBe(true);
  });

  test("richtet die Anmeldung mit Code ein und meldet damit an", async ({ page }) => {
    test.setTimeout(60_000);
    await login(page, "sandra");
    await page.goto("/settings?section=security");
    await page.getByRole("button", { name: "Einrichten" }).click();
    const secret = (await page.getByTestId("totp-secret").textContent()) ?? "";
    await page.getByLabel("Bestätigungscode").fill("000000");
    await page.getByLabel("Aktuelles Passwort").nth(1).fill(DEV_PASSWORD);
    await page.getByRole("button", { name: "Einschalten" }).click();
    await expect(page.getByRole("alert").last()).toContainText("Der Code stimmt nicht");
    await page.getByLabel("Bestätigungscode").fill(await totp(secret));
    await page.getByRole("button", { name: "Einschalten" }).click();
    await expect(page.getByRole("status").filter({ hasText: "eingeschaltet" })).toBeVisible();

    await page
      .getByRole("button", { name: address("sandra") })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Abmelden" }).click();
    await page.getByLabel("E-Mail-Adresse").fill(address("sandra"));
    await page.getByLabel("Passwort").fill(DEV_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.getByLabel("Bestätigungscode").fill(await totp(secret));
    await page.getByRole("button", { name: "Anmelden" }).click();
    // back where Sandra was before signing out
    await expect(page.getByRole("heading", { name: "Passwort und Sicherheit" })).toBeVisible();

    await page.goto("/settings?section=security");
    // switched on: only the state and the button, the fields come on asking to switch off
    await expect(page.getByText("Eingeschaltet", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Aktuelles Passwort")).toHaveCount(1);
    await page.getByRole("button", { name: "Ausschalten" }).click();
    await page.getByLabel("Aktuelles Passwort").nth(1).fill(DEV_PASSWORD);
    await page
      .getByLabel("Bestätigungscode")
      .nth(1)
      .fill(await totp(secret));
    await page.getByRole("button", { name: "Ausschalten" }).click();
    await expect(page.getByRole("status").filter({ hasText: "ausgeschaltet" })).toBeVisible();
  });
});

test.describe("Darstellung", () => {
  test("wechselt auf dunkel und bleibt dabei", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=appearance");
    await page.getByText("Dunkel", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page.getByText("Hell", { exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/\blight\b/);
    await page.getByText("Wie das Gerät").click();
  });
});

test.describe("Tab-Leiste am Handy @phone", () => {
  test("legt Kontakte in die Tab-Leiste und setzt sie zurück @phone", async ({ page }) => {
    await login(page);
    const tabBar = page.getByRole("navigation", { name: "Apps" });
    await page.goto("/settings?section=appearance");
    const card = page.locator("section").filter({ hasText: "Tab-Leiste am Handy" });
    await card.getByLabel("Tab-Leiste, Platz 4").selectOption({ label: "Kontakte" });
    await expect(card).toContainText("Unter „Mehr“: Aufgaben");

    await page.goto("/mail");
    await expect(tabBar.getByRole("link", { name: "Kontakte" })).toBeVisible();
    await expect(tabBar.getByRole("link", { name: "Aufgaben" })).toHaveCount(0);
    await tabBar.getByRole("button", { name: "Mehr" }).click();
    await expect(page.getByRole("menuitem", { name: "Aufgaben" })).toBeVisible();
    await page.keyboard.press("Escape");
    await tabBar.getByRole("link", { name: "Kontakte" }).click();
    await expect(page.getByRole("searchbox", { name: "Kontakte suchen" })).toBeVisible();

    // Picking an app that already has a place swaps the two.
    await page.goto("/settings?section=appearance");
    await card.getByLabel("Tab-Leiste, Platz 1").selectOption({ label: "Kontakte" });
    await expect(card.getByLabel("Tab-Leiste, Platz 4")).toHaveValue("/mail");

    await card.getByRole("button", { name: "Zurücksetzen" }).click();
    await expect(card.getByLabel("Tab-Leiste, Platz 1")).toHaveValue("/mail");
    await expect(card.getByLabel("Tab-Leiste, Platz 4")).toHaveValue("/tasks");
    await page.goto("/mail");
    await expect(tabBar.getByRole("link", { name: "Aufgaben" })).toBeVisible();
  });
});
