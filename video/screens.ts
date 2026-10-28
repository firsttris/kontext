import { type Browser, expect, type Page } from "@playwright/test";
import { login } from "../e2e/helpers";

/**
 * The browsers of a take: sharp pictures (twice the pixels on a desktop, three times on a phone),
 * so the camera can come close without blur.
 */

const common = { locale: "de-DE", timezoneId: "Europe/Berlin" } as const;

export const ADDRESS = "kontext.weber-haustechnik.de";

export const desktopOf = async (browser: Browser, user = "jonas", colorScheme?: "dark") => {
  const context = await browser.newContext({
    ...common,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    ...(colorScheme ? { colorScheme } : {}),
  });
  const page = await context.newPage();
  await login(page, user);
  return page;
};

export const phoneOf = async (browser: Browser, user = "jonas") => {
  const context = await browser.newContext({
    ...common,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await login(page, user);
  return page;
};

/** A card that is not the app (the agent's chat, what the server holds), from HTML. */
export const panelOf = async (browser: Browser, width: number, height: number) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  return context.newPage();
};

export const closeAll = (...pages: Page[]) =>
  Promise.all(pages.map((page) => page.context().close()));

/** The open mail is drawn: its text, and the thumbnails of its attachments (pdf.js takes a moment). */
export const mailShown = async (page: Page, end = "Viele Grüße") => {
  await expect(page.frameLocator("iframe").getByText(end).first()).toBeVisible();
  const attachments = page.getByRole("list", { name: "Anhänge" });
  if (await attachments.count()) await expect(attachments.locator("img").first()).toBeVisible();
};

/** The reading pane of the desktop layout, in CSS pixels. */
export const READING = { x: 666, y: 0, width: 774, height: 720 };

/** Today in Berlin, as the calendar's URLs and data-day attributes have it. */
export const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
