import { expect, type Page, test } from "@playwright/test";
import { DEV_PASSWORD } from "../dev/config";
import { login } from "./helpers";

/**
 * A passkey on Chrome's virtual authenticator (DevTools' WebAuthn domain): it answers at once, as a
 * fingerprint would. Stalwart's public URL is the app's address (dev/stalwart.ts `--app`), so the
 * relying party is `localhost`, as on a customer's server it is Kontext's domain.
 */
const withAuthenticator = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
};

const passkeys = (page: Page) => page.getByRole("list", { name: "Passkeys" });

/** Adds a passkey in the settings, after the password once more. */
const addPasskey = async (page: Page, name: string) => {
  await page.goto("/settings?section=security");
  await page.getByRole("button", { name: "Passkey hinzufügen" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Passwort").last().fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Passkey anlegen" }).click();
  await expect(passkeys(page).getByText(name)).toBeVisible();
};

/** Signed out: the session cookie gone, as after "Abmelden" on another day. */
const signInWithPasskey = async (page: Page) => {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: "Mit Passkey anmelden" }).click();
  await expect(page).toHaveURL(/\/mail\//);
};

test.describe("Passkeys", () => {
  test("legt einen Passkey an, meldet sich damit an, benennt ihn um und löscht ihn", async ({
    page,
  }) => {
    await withAuthenticator(page);
    await login(page, "max");
    await addPasskey(page, "Werkstatt-PC");

    await signInWithPasskey(page);

    await page.goto("/settings?section=security");
    const row = passkeys(page).getByRole("listitem").filter({ hasText: "Werkstatt-PC" });
    await row.getByRole("button", { name: "Umbenennen" }).click();
    await passkeys(page).getByLabel("Name").fill("Büro-PC");
    await passkeys(page).getByRole("button", { name: "Speichern" }).click();
    const renamed = passkeys(page).getByRole("listitem").filter({ hasText: "Büro-PC" });
    await expect(renamed).toBeVisible();

    await renamed.getByRole("button", { name: "Löschen" }).click();
    await page.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(page.getByText("Noch keine Passkeys.")).toBeVisible();

    // Stalwart no longer knows it: the sign-in fails with a way on.
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByRole("button", { name: "Mit Passkey anmelden" }).click();
    await expect(page.getByRole("alert")).toContainText("Dieser Passkey ist hier nicht bekannt");
  });

  test("lehnt einen neuen Passkey mit falschem Passwort ab", async ({ page }) => {
    await withAuthenticator(page);
    await login(page, "sandra");
    await page.goto("/settings?section=security");
    await page.getByRole("button", { name: "Passkey hinzufügen" }).click();
    await page.getByLabel("Name").fill("Fremd");
    await page.getByLabel("Passwort").last().fill("falsch");
    await page.getByRole("button", { name: "Passkey anlegen" }).click();
    await expect(page.getByRole("alert")).toHaveText("Das aktuelle Passwort stimmt nicht.");
  });
});

test.describe("Passkeys am Handy @phone", () => {
  test("legt einen Passkey an und meldet sich damit an @phone", async ({ page }) => {
    await withAuthenticator(page);
    await login(page, "anna");
    await addPasskey(page, "Handy");
    await signInWithPasskey(page);
  });
});
