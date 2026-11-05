import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

const ANSWER = "Der Entwurf an Frau Keller liegt in „Entwürfe“.";
const DONE = "Entwurf an petra.keller@keller-elektro.test liegt in „Entwürfe“ von Jonas Weber.";

/**
 * The server in CI has no ANTHROPIC_API_KEY: here the page gets an assistant that answers like
 * Claude after create_draft. The loop itself is tested in server/assistant/agent.test.ts.
 */
const withAssistant = async (page: Page) => {
  const asked: unknown[] = [];
  await page.route("**/api/assistant", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { enabled: true } });
    asked.push(route.request().postDataJSON());
    return route.fulfill({ json: { text: ANSWER, done: [DONE], incomplete: false } });
  });
  return asked;
};

const ask = async (page: Page, question: string) => {
  await page.getByRole("textbox", { name: "Frage an den Assistenten" }).fill(question);
  await page.getByRole("textbox", { name: "Frage an den Assistenten" }).press("Enter");
};

test.describe("Assistent im Chat", () => {
  test("ohne Schlüssel am Server gibt es keinen Assistenten", async ({ page }) => {
    await login(page);
    await page.goto("/chat");
    await expect(page.getByRole("navigation", { name: "Kanäle" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Assistent" })).toHaveCount(0);
  });

  test("beantwortet eine Frage und nennt den angelegten Entwurf", async ({ page }) => {
    const asked = await withAssistant(page);
    await login(page);
    await page.goto("/chat");
    await page.getByRole("link", { name: "Assistent" }).click();
    await expect(page.getByRole("heading", { name: "Assistent" })).toBeVisible();
    await ask(page, "Schreib Frau Keller, dass wir Dienstag kommen.");
    await expect(page.getByText(ANSWER)).toBeVisible();
    await expect(page.getByRole("list", { name: "Angelegt" })).toContainText(DONE);
    expect(asked).toEqual([
      { messages: [{ role: "user", text: "Schreib Frau Keller, dass wir Dienstag kommen." }] },
    ]);
    await page.getByRole("button", { name: "Neues Gespräch" }).click();
    await expect(page.getByText(ANSWER)).toHaveCount(0);
  });
});

test.describe("Assistent am Handy @phone", () => {
  test("fragt aus der Chat-Liste und kommt zurück @phone", async ({ page }) => {
    await withAssistant(page);
    await login(page);
    await page.goto("/chat");
    await page.getByRole("link", { name: /^Assistent/ }).click();
    await ask(page, "Was gab es zuletzt mit Keller Elektro?");
    await expect(page.getByText(ANSWER)).toBeVisible();
    await page.getByRole("button", { name: "Zurück zu den Chats" }).click();
    await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
  });
});
