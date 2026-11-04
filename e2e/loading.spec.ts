import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Holds every JMAP request until the test lets them go, so the start's loading state stays on
 * screen. By the path, not a glob: the app's own modules live under /src/jmap/ in the dev server.
 */
const holdJmap = async (page: Page) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    (url) => url.pathname === "/jmap" || url.pathname.startsWith("/jmap/"),
    async (route) => {
      await gate;
      await route.continue().catch(() => undefined);
    },
  );
  return release;
};

/** The placeholder's one spoken line (src/components/ui/placeholder.tsx). */
const loading = (page: Page) => page.getByRole("status").filter({ hasText: /^Lädt …$/ });

const showsShapeThenList = async (page: Page) => {
  await login(page);
  const release = await holdJmap(page);
  await page.goto("/mail");
  // Not a blank page: the shape of the list with bars, said once to screen readers.
  await expect(loading(page)).toHaveCount(1);
  await expect(loading(page)).toBeVisible();
  await expect(page.locator("#root li").first()).toBeVisible();
  await expect(page.getByRole("list", { name: "Posteingang" })).toHaveCount(0);
  release();
  await expect(page.getByRole("list", { name: "Posteingang" })).toBeVisible();
  await expect(loading(page)).toHaveCount(0);
};

test("Beim Start zeigt die Mail-Seite ihre Form statt einer leeren Seite", async ({ page }) => {
  await showsShapeThenList(page);
  await expect(page.getByRole("navigation", { name: "Apps" })).toBeVisible();
});

test("Beim Start zeigt die Mail-Seite am Handy ihre Form und dann die Tab-Leiste @phone", async ({
  page,
}) => {
  await showsShapeThenList(page);
  await expect(page.getByRole("navigation", { name: "Apps" })).toBeVisible();
});
