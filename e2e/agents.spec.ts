import { expect, type Page, test } from "@playwright/test";
import { DEV_PASSWORD } from "../dev/config";
import { addMail, jmapAs, login, unique } from "./helpers";

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
    const subject = unique("Angebot Wartung");
    // A mail of its own: the seed's mails stay as other tests expect them.
    await addMail("jonas", "jonas", subject);
    await login(page);
    const key = await createKey(page, name, true);
    const original = await mailId(subject);

    const done = await answer(
      await callTool(page, key, "create_draft", {
        accountId: original.accountId,
        replyToEmailId: original.id,
        text: "Hallo Erika,\n\ndas passt so.\n\nViele Grüße\nJonas",
      }),
    );
    expect(done).toContain("liegt in „Entwürfe“");

    // The draft waits in Drafts, answering the original, for Jonas to send it.
    await page.goto("/mail");
    await page.getByRole("link", { name: /Entwürfe/ }).click();
    await expect(
      page.getByRole("list", { name: "Entwürfe" }).getByText(`Re: ${subject}`),
    ).toBeVisible();

    // The settings show what the agent changed.
    await page.goto("/settings?section=agents");
    const listed = page.getByRole("listitem").filter({ hasText: name });
    await expect(listed).toContainText("lesen, anlegen, ändern");
    await expect(listed.getByRole("list", { name: `Letzte Änderungen von ${name}` })).toContainText(
      "Entwurf an erika@example.test",
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

/** PKCE (RFC 7636): a verifier and its S256 challenge. */
const pkce = async () => {
  const verifier = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: Buffer.from(digest).toString("base64url") };
};

test.describe("KI-Agenten mit Anmeldung (OAuth)", () => {
  test("ein Agent meldet sich im Browser an, die Person erlaubt mit Passwort", async ({
    page,
    playwright,
    baseURL,
  }) => {
    // The agent's own requests: a context of its own, without the browser's cookies.
    const agent = await playwright.request.newContext({ baseURL });
    const callback = "http://127.0.0.1:9999/callback";
    const name = unique("Test-Agent");
    const callMcp = (token: string) =>
      agent.post("/mcp", {
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json, text/event-stream",
        },
        data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
      });

    // The agent finds the sign-in from /mcp (RFC 9728) and registers itself (RFC 7591).
    const challenge = await agent.post("/mcp", { data: {} });
    expect(challenge.status()).toBe(401);
    expect(challenge.headers()["www-authenticate"]).toContain("oauth-protected-resource/mcp");
    const resource = await (await agent.get("/.well-known/oauth-protected-resource/mcp")).json();
    const issuer = resource.authorization_servers[0] as string;
    const metadata = await (
      await agent.get(`/.well-known/oauth-authorization-server${new URL(issuer).pathname}`)
    ).json();
    const client = await (
      await agent.post(metadata.registration_endpoint, {
        data: {
          client_name: name,
          redirect_uris: [callback],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          scope: "openid offline_access read write",
        },
      })
    ).json();

    // The browser: sign-in, then the consent page, then back to the agent with a code.
    const { verifier, challenge: codeChallenge } = await pkce();
    const authorize = new URL(metadata.authorization_endpoint);
    for (const [key, value] of Object.entries({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: callback,
      scope: "openid offline_access read write",
      state: "st",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      resource: resource.resource,
    })) {
      authorize.searchParams.set(key, value);
    }
    await page.route(`${callback}*`, (route) => route.fulfill({ body: "zurück beim Agenten" }));
    await page.goto(authorize.toString());
    await page.getByLabel("E-Mail-Adresse").fill("jonas@weber-haustechnik.test");
    await page.getByLabel("Passwort").fill(DEV_PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(
      page.getByRole("heading", { name: `${name} möchte mit Kontext arbeiten` }),
    ).toBeVisible();
    await page.getByLabel("Darf anlegen und ändern").check();
    await page.getByLabel("Dein Passwort").fill(DEV_PASSWORD);
    await page.getByRole("button", { name: "Erlauben" }).click();
    await page.waitForURL(`${callback}*`);
    const back = new URL(page.url());
    expect(back.searchParams.get("state")).toBe("st");

    const token = await (
      await agent.post(metadata.token_endpoint, {
        form: {
          grant_type: "authorization_code",
          code: back.searchParams.get("code")!,
          redirect_uri: callback,
          client_id: client.client_id,
          code_verifier: verifier,
          resource: resource.resource,
        },
      })
    ).json();
    expect(token.access_token, JSON.stringify(token)).toBeTruthy();

    // With the token the agent works, writing included; the settings list it.
    const tools = (await (await callMcp(token.access_token)).json()).result.tools as {
      name: string;
    }[];
    expect(tools.map((tool) => tool.name)).toContain("create_draft");
    await page.goto("/settings?section=agents");
    const listed = page.getByRole("listitem").filter({ hasText: name });
    await expect(listed).toContainText("Anmeldung");
    await expect(listed).toContainText("lesen, anlegen, ändern");

    // Separated: the token no longer opens Kontext, the agent is told to sign in again.
    await listed.getByRole("button", { name: "Trennen" }).click();
    await listed.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(listed).toHaveCount(0);
    const after = await callMcp(token.access_token);
    expect(after.status()).toBe(401);
    expect(after.headers()["www-authenticate"]).toContain("resource_metadata");
    await agent.dispose();
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
