import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/** The width of the column right of the rail: the module's sidebar. */
const sidebarWidth = (page: Page) =>
  page.getByRole("navigation", { name: "Apps" }).evaluate((rail) => {
    const column = [...(rail.nextElementSibling?.children ?? [])].find(
      (child) => child.getBoundingClientRect().width > 0,
    );
    return column?.getBoundingClientRect().width;
  });

test("Die Seitenleiste ist in Mail, Kalender, Aufgaben, Chat und Einstellungen gleich breit", async ({
  page,
}) => {
  await login(page);
  for (const path of ["/mail", "/calendar", "/tasks", "/chat", "/settings"]) {
    await page.goto(path);
    await expect.poll(() => sidebarWidth(page), { message: path }).toBe(236);
  }
});
