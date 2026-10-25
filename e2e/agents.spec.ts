import { expect, type Page, test } from "@playwright/test";
import { DEV_PASSWORD } from "../dev/config";
import { jmapAs, login, unique } from "./helpers";

/** One MCP request with the key, as an agent makes it (server/mcp/). */
const mcp = (page: Page, key: string, method: string, params: Record<string, unknown> = {}) =>
  page.context().request.post("/mcp", {
    headers: {
      authorization: `Bearer ${key}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    data: { jsonrpc: "2.0", id: 1, method, params },
  });

const callTool = (page: Page, key: string, name: string, args: Record<string, unknown>) =>
  mcp(page, key, "tools/call", { name, arguments: args });

const answer = async (response: Awaited<ReturnType<typeof mcp>>) =>
  (await response.json()).result.content[0].text as string;

const createKey = async (page: Page, name: string, write = false) => {
  await page.goto("/settings?section=agents");
  await expect(page.getByText(/\/mcp$/)).toBeVisible();
  await page.getByLabel("Name des Agenten").fill(name);
  await page.getByLabel("Dein Passwort").fill(DEV_PASSWORD);
  if (write) await page.getByLabel("Darf anlegen und ändern").check();
  await page.getByRole("button", { name: "Schlüssel anlegen" }).click();
  await expect(page.getByText("Der Schlüssel ist nur jetzt zu sehen.")).toBeVisible();
  return (await page.getByTestId("mcp-key").textContent()) ?? "";
};

/** The id of a mail in Jonas' inbox, found behind the UI's back. */
const mailId = async (subject: string) => {
  const client = jmapAs("jonas");
  const { primaryAccounts } = await client.getSession();
  const accountId = primaryAccounts["urn:ietf:params:jmap:mail"]!;
  const { ids } = await client.call<{ ids: string[] }>("Email/query", {
    accountId,
    filter: { subject },
  });
  return { accountId, id: ids[0]! };
};

test.describe("KI-Agenten (MCP)", () => {
  test("ein Schlüssel öffnet Kontext für einen Agenten, bis er getrennt ist", async ({ page }) => {
    const name = unique("Claude");
    await login(page);
    const key = await createKey(page, name);
    expect(key).toMatch(/^kontext_/);
    await expect(page.getByText(/^claude mcp add --transport http kontext/)).toBeVisible();

    // Reading only: no tool that writes.
    const tools = (await (await mcp(page, key, "tools/list")).json()).result.tools as {
      name: string;
    }[];
    expect(tools.map((tool) => tool.name)).toContain("customer_overview");
    expect(tools.map((tool) => tool.name)).not.toContain("create_draft");

    // The agent sees the customer across the own mailbox and the shared ones.
    const response = await callTool(page, key, "customer_overview", { query: "Keller" });
    expect(response.status()).toBe(200);
    const text = await answer(response);
    expect(text).toContain("Petra Keller");
    expect(text).toContain("Angebot Wartungsvertrag 2027");
    expect(text).toContain("rechnung@weber-haustechnik.test");

    await page.getByRole("button", { name: "Fertig" }).click();
    // When it was last used shows the next time the settings open.
    await page.reload();
    const listed = page.getByRole("listitem").filter({ hasText: name });
    await expect(listed).toContainText("zuletzt benutzt");
    await expect(listed).toContainText("nur lesen");
    await listed.getByRole("button", { name: "Trennen" }).click();
    await listed.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(listed).toHaveCount(0);
    expect((await callTool(page, key, "list_accounts", {})).status()).toBe(401);
  });

  test("mit Schreibrecht legt der Agent einen Antwort-Entwurf an – gesendet wird nichts", async ({
    page,
  }) => {
    const name = unique("Claude schreibt");
    const text = unique("Halle 2 nehmen wir mit auf");
    await login(page);
    const key = await createKey(page, name, true);
    const original = await mailId("Angebot Wartungsvertrag 2027");

    const done = await answer(
      await callTool(page, key, "create_draft", {
        accountId: original.accountId,
        replyToEmailId: original.id,
        text: `Hallo Petra,\n\n${text}.\n\nViele Grüße\nJonas`,
      }),
    );
    expect(done).toContain("liegt in „Entwürfe“");

    // The draft waits in Drafts, answering the original, for Jonas to send it.
    await page.goto("/mail");
    await page.getByRole("link", { name: /Entwürfe/ }).click();
    await expect(
      page.getByRole("list", { name: "Entwürfe" }).getByText("Re: Angebot Wartungsvertrag 2027"),
    ).toBeVisible();

    // The settings show what the agent changed.
    await page.goto("/settings?section=agents");
    const listed = page.getByRole("listitem").filter({ hasText: name });
    await expect(listed).toContainText("lesen, anlegen, ändern");
    await expect(listed.getByRole("list", { name: `Letzte Änderungen von ${name}` })).toContainText(
      "Entwurf an petra.keller@keller-elektro.test",
    );
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
