import { expect, type Page, test } from "@playwright/test";
import { jmapAs, login, personalAccountId, unique } from "./helpers";

/**
 * Abmelden nach Inaktivität for this page only: the app's read is answered here (after asking the
 * real server, whose answer must be fine). Set at the server, it would sign out the tests running
 * beside this one. The page's clock is Playwright's, so the 15 minutes pass at once.
 */
const idleAfter15Minutes = async (page: Page) => {
  await page.route("**/api/company/idle-logout", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    expect((await route.fetch()).ok()).toBe(true);
    await route.fulfill({ json: { minutes: 15 } });
  });
  await page.clock.install();
};

/** Signed in, with the app's timer started on the time answered above. */
const signedInWithTimer = async (page: Page) => {
  const read = page.waitForResponse("**/api/company/idle-logout");
  await login(page);
  await read;
  // The timer starts in the effect after the answer's render.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 200)));
};

const question = (page: Page) => page.getByRole("dialog", { name: "Angemeldet bleiben?" });

const draftsWith = async (user: string, subject: string) => {
  const accountId = await personalAccountId(user);
  const [query] = await jmapAs(user).request([
    ["Email/query", { accountId, filter: { subject, hasKeyword: "$draft" } }, "q"],
  ]);
  return (query![1].ids as string[]).length;
};

test.describe("Abmelden nach Inaktivität", () => {
  test("fragt vor Ablauf, und „Angemeldet bleiben“ hält die Sitzung", async ({ page }) => {
    await idleAfter15Minutes(page);
    await signedInWithTimer(page);

    await page.clock.fastForward("14:05");
    await expect(question(page)).toBeVisible();
    await expect(question(page).getByRole("timer")).toHaveText(/^0:[0-5]\d$/);
    // Moving the mouse is no answer: the question wants one.
    await page.mouse.move(200, 200);
    await page.mouse.move(400, 300);
    await expect(question(page)).toBeVisible();

    await question(page).getByRole("button", { name: "Angemeldet bleiben" }).click();
    await expect(question(page)).toBeHidden();
    // The time started anew: 13 minutes on, still signed in and not asked.
    await page.clock.fastForward("13:00");
    await expect(question(page)).toBeHidden();
    await expect(page).toHaveURL(/\/mail\//);
  });

  test("meldet ab, wenn niemand antwortet", async ({ page }) => {
    await idleAfter15Minutes(page);
    await signedInWithTimer(page);
    await page.clock.fastForward("14:30");
    await expect(question(page)).toBeVisible();
    await page.clock.fastForward("00:31");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/mail");
    await expect(page).toHaveURL(/\/login/);
  });

  test("speichert eine angefangene Mail vorher als Entwurf", async ({ page }) => {
    await idleAfter15Minutes(page);
    await signedInWithTimer(page);
    const subject = unique("Rückruf Empfang");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByLabel("Betreff").fill(subject);
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill("Herr Brandt bittet um Rückruf wegen der Heizung.");
    // Before the autosave's two seconds: the sign-out saves it itself.
    await page.clock.fastForward("15:01");
    await expect(page).toHaveURL(/\/login/);
    await expect.poll(() => draftsWith("jonas", subject)).toBe(1);
  });
});

test("meldet nicht sofort ab, wenn die Firmenverwaltung die Zeit einschaltet, während jemand arbeitet", async ({
  page,
}) => {
  // Off first; the Firmenverwaltung switches it on while Jonas keeps working.
  let minutes = 0;
  await page.route("**/api/company/idle-logout", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    expect((await route.fetch()).ok()).toBe(true);
    await route.fulfill({ json: { minutes } });
  });
  await page.clock.install();
  await login(page);
  for (let step = 0; step < 4; step++) {
    await page.clock.fastForward("05:00");
    await page.mouse.move(100 + step * 50, 200);
    await page.keyboard.press("Shift");
  }
  minutes = 15;
  const read = page.waitForResponse("**/api/company/idle-logout");
  await page.reload();
  await read;
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
  // Twenty minutes of work since the sign-in, the last input just now: no sign-out, no question.
  await expect(page).toHaveURL(/\/mail\//);
  await expect(question(page)).toBeHidden();
  await page.clock.fastForward("10:00");
  await expect(question(page)).toBeHidden();
  await expect(page).toHaveURL(/\/mail\//);
});

test("Abmelden nach Inaktivität setzt die Firmenverwaltung", async ({ page }) => {
  // The save is answered here, so no other test is signed out; the server's side is in
  // server/company/routes.test.ts.
  const saved: number[] = [];
  await page.route("**/api/company/idle-logout", async (route) => {
    if (route.request().method() !== "PUT") return route.fallback();
    const { minutes } = route.request().postDataJSON() as { minutes: number };
    saved.push(minutes);
    await route.fulfill({ json: { minutes } });
  });
  await login(page, "jonas");
  await page.goto("/settings?section=company-idle");
  const time = page.getByRole("combobox", { name: "Abmelden nach" });
  await expect(time).toHaveValue("0");
  await expect(time.locator("option")).toHaveText([
    "Nie (aus)",
    "15 Minuten",
    "30 Minuten",
    "1 Stunde",
    "4 Stunden",
    "8 Stunden",
  ]);
  const save = page.getByRole("button", { name: "Speichern" });
  await expect(save).toBeDisabled();
  await time.selectOption("30 Minuten");
  await save.click();
  await expect(page.getByRole("status")).toHaveText("Gespeichert.");
  expect(saved).toEqual([30]);
});
