import { expect, type Page, test } from "@playwright/test";
import { DEV_PASSWORD } from "../dev/config";
import { login, unique } from "./helpers";

/** One MCP call with the key, as an agent makes it (server/mcp/). */
const callTool = (page: Page, key: string, name: string, args: Record<string, unknown>) =>
  page.context().request.post("/mcp", {
    headers: {
      authorization: `Bearer ${key}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
  });

const createKey = async (page: Page, name: string) => {
  await page.goto("/settings?section=agents");
  await expect(page.getByText(/\/mcp$/)).toBeVisible();
  await page.getByLabel("Name des Agenten").fill(name);
  await page.getByLabel("Dein Passwort").fill(DEV_PASSWORD);
  await page.getByRole("button", { name: "Schlüssel anlegen" }).click();
  await expect(page.getByText("Der Schlüssel ist nur jetzt zu sehen.")).toBeVisible();
  return (await page.getByTestId("mcp-key").textContent()) ?? "";
};

test.describe("KI-Agenten (MCP)", () => {
  test("ein Schlüssel öffnet Kontext für einen Agenten, bis er widerrufen ist", async ({
    page,
  }) => {
    const name = unique("Claude");
    await login(page);
    const key = await createKey(page, name);
    expect(key).toMatch(/^kontext_/);
    await expect(page.getByText(/^claude mcp add --transport http kontext/)).toBeVisible();

    // The agent sees the customer across the own mailbox and the shared ones.
    const answer = await callTool(page, key, "customer_overview", { query: "Keller" });
    expect(answer.status()).toBe(200);
    const text = (await answer.json()).result.content[0].text as string;
    expect(text).toContain("Petra Keller");
    expect(text).toContain("Angebot Wartungsvertrag 2027");
    expect(text).toContain("rechnung@weber-haustechnik.test");

    await page.getByRole("button", { name: "Fertig" }).click();
    // When it was last used shows the next time the settings open.
    await page.reload();
    const listed = page.getByRole("listitem").filter({ hasText: name });
    await expect(listed).toContainText("zuletzt benutzt");
    await listed.getByRole("button", { name: "Widerrufen" }).click();
    await listed.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(listed).toHaveCount(0);
    expect((await callTool(page, key, "list_accounts", {})).status()).toBe(401);
  });

  test("ohne Schlüssel oder mit falschem Passwort gibt es nichts", async ({ page }) => {
    await login(page);
    expect((await page.context().request.post("/mcp", { data: {} })).status()).toBe(401);
    await page.goto("/settings?section=agents");
    await page.getByLabel("Name des Agenten").fill("Falsch");
    await page.getByLabel("Dein Passwort").fill("nicht-das-passwort");
    await page.getByRole("button", { name: "Schlüssel anlegen" }).click();
    await expect(page.getByRole("alert")).toHaveText("Passwort oder Code falsch.");
  });
});

test.describe("KI-Agenten am Handy @phone", () => {
  test("legt einen Schlüssel an @phone", async ({ page }) => {
    await login(page);
    await page.goto("/settings");
    await page.getByRole("link", { name: "KI-Agenten" }).click();
    const key = await createKey(page, unique("Handy"));
    expect(key).toMatch(/^kontext_/);
  });
});
