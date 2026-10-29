/** Steps the chat's e2e tests share: a colleague's own browser, channels, writing, a message. */
import { type Browser, expect, type Page } from "@playwright/test";
import { login, unique } from "./helpers";

export const colleague = async (browser: Browser, user: string) => {
  const page = await (await browser.newContext()).newPage();
  await login(page, user);
  return page;
};

export const openChannel = async (page: Page, name: string | RegExp) => {
  await page.getByRole("link", { name: /^Chat/ }).first().click();
  await page
    .getByRole("navigation", { name: "Kanäle" })
    .first()
    .getByRole("link", { name })
    .click();
};

export const newChannel = async (page: Page, members: string[]) => {
  const name = unique("Lager");
  const slug = name.toLowerCase().replace(/ /g, "-");
  await page.getByRole("link", { name: /^Chat/ }).first().click();
  await page.getByRole("button", { name: "Neue Nachricht" }).click();
  const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
  await dialog.getByRole("tab", { name: "Kanal" }).click();
  await dialog.getByLabel("Name des Kanals").fill(name);
  for (const member of members) await dialog.getByText(member).click();
  await dialog.getByRole("button", { name: "Kanal anlegen" }).click();
  await expect(page.getByRole("heading", { name: `# ${slug}` })).toBeVisible();
  return slug;
};

export const write = async (page: Page, text: string, field = "Nachricht") => {
  await page.getByRole("textbox", { name: field }).last().fill(text);
  await page.keyboard.press("Enter");
};

/**
 * One message in the conversation (not in the thread beside it), as the server has it: the copy
 * shown at once while sending ("pending-…") has no actions yet and may stand beside it a moment.
 */
export const messageIn = (page: Page, text: string) =>
  page
    .getByRole("list", { name: "Nachrichten" })
    .first()
    .locator('[data-message]:not([data-message^="pending-"])')
    .filter({ hasText: text });
