import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * WCAG 2.2 AA as far as a machine can check it (axe-core): every page in light and dark, on the
 * desktop and the phone. What a machine cannot judge (reading order, sensible labels, a screen
 * reader's run through the app) is listed in docs/accessibility.md.
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const PAGES = [
  "/mail",
  "/compose",
  "/calendar",
  "/contacts",
  "/chat",
  "/tasks",
  "/settings",
  "/documents",
];

const violations = async (page: Page) => {
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG)
    // The box that picks a mail is 16 px, but the whole 36 px column beside the row clicks it
    // (message-row.tsx), which axe cannot see.
    .exclude('input[type="checkbox"][aria-label$="auswählen"]')
    // The account menu shows the person's initials as a picture of them, like a photo (hidden from
    // screen readers), and is named by the full address; axe takes the initials for a text label.
    .exclude('nav[aria-label="Apps"] > button[aria-haspopup="menu"]')
    .analyze();
  return violations.map(
    ({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(" ")).join(", ")}`,
  );
};

const checkPages = async (page: Page, theme: "light" | "dark") => {
  await page.emulateMedia({ colorScheme: theme });
  await page.goto("/login");
  await expect(page.getByLabel("Passwort")).toBeVisible();
  expect(await violations(page), "/login").toEqual([]);
  await login(page);
  for (const path of PAGES) {
    await page.goto(path);
    // Lists, events and messages come in after the page itself; the push channel never lets
    // the network go idle.
    await page.waitForTimeout(1500);
    expect(await violations(page), path).toEqual([]);
  }
};

for (const theme of ["light", "dark"] as const) {
  test(`Alle Seiten halten WCAG 2.2 AA ein, soweit axe es prüft (${theme})`, async ({ page }) => {
    test.setTimeout(120_000);
    await checkPages(page, theme);
  });

  test(`Alle Seiten halten am Handy WCAG 2.2 AA ein, soweit axe es prüft (${theme}) @phone`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await checkPages(page, theme);
  });
}
