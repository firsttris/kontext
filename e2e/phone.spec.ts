import { type ChildProcess, spawn } from "node:child_process";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Telephony with the fake box (dev/fake-box.ts): it pairs and talks to the e2e server like the
 * real one; the test rings it over its control port. There is no LiveKit SIP here, so nobody
 * hears anything – the tests are about what Kontext does with the calls.
 */
const SERVER = "http://127.0.0.1:28090";
const CONTROL = "http://127.0.0.1:28096";

const box = {
  process: null as ChildProcess | null,
  start: async (code: string) => {
    box.process = spawn(
      "bun",
      ["dev/fake-box.ts", "--url", SERVER, "--code", code, "--control", "28096"],
      { stdio: "inherit" },
    );
    await expect
      .poll(async () => (await fetch(`${CONTROL}/state`).catch(() => null))?.ok ?? false, {
        timeout: 20_000,
      })
      .toBe(true);
  },
  ring: async (from: string) =>
    (await (
      await fetch(`${CONTROL}/ring`, { method: "POST", body: JSON.stringify({ from }) })
    ).json()) as { call: string },
  hangup: (call: string, cause = 16) =>
    fetch(`${CONTROL}/hangup`, { method: "POST", body: JSON.stringify({ call, cause }) }),
  state: async () =>
    (await (await fetch(`${CONTROL}/state`)).json()) as {
      connected: boolean;
      config: { line: { username: string } | null } | null;
      commands: { type: string; number?: string }[];
    },
  stop: () => box.process?.kill(),
};

const colleague = async (browser: Browser, user: string) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return { page, close: () => context.close() };
};

const panel = (page: Page) => page.getByRole("region", { name: /^Telefonat:/ });

test.describe("Telefonie über die Telefonbox", () => {
  test.describe.configure({ mode: "serial" });
  test.afterAll(() => box.stop());

  test("Firmenverwaltung: Fritzbox-Anmeldung, wer klingelt, Box koppeln", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=phone");
    const line = page.getByRole("region", { name: "Anmeldung an der Fritzbox" });
    await line.getByLabel("Benutzername").fill("kontext620");
    await line.getByLabel("Kennwort").fill("geheim");
    await line.getByRole("button", { name: "Speichern" }).click();

    const ring = page.getByRole("region", { name: "Wer klingelt" });
    await ring.getByLabel("Jonas Weber").check();
    await ring.getByLabel("Anna Weber").check();
    await ring.getByRole("button", { name: "Speichern" }).click();

    const callbacks = page.getByRole("region", { name: "Verpasste Anrufe" });
    await callbacks
      .getByLabel("Aufgabe anlegen auf dem Board")
      .selectOption({ label: "Jonas Weber" });
    await callbacks.getByRole("button", { name: "Speichern" }).click();

    const boxes = page.getByRole("region", { name: "Telefonbox" });
    await boxes.getByRole("button", { name: "Box koppeln" }).click();
    const code = (await boxes.getByText(/^Kopplungscode: /).textContent())!.replace(
      "Kopplungscode: ",
      "",
    );
    await box.start(code);
    await expect.poll(async () => (await box.state()).config?.line?.username).toBe("kontext620");
    await page.reload();
    await expect(page.getByRole("region", { name: "Telefonbox" })).toContainText(
      "verbunden · an der Fritzbox angemeldet",
    );
    // Telefon is in the rail now.
    await expect(page.getByRole("link", { name: "Telefon", exact: true })).toBeVisible();
  });

  test("ein Anruf klingelt bei beiden, Jonas sieht den Kontakt und nimmt an", async ({
    page,
    browser,
  }) => {
    await login(page);
    const anna = await colleague(browser, "anna");
    await box.ring("07223 81234");

    // Jonas has Petra Keller in his address book; Anna only sees the number.
    const card = page.getByRole("dialog", { name: "Anruf von Petra Keller" });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Keller Elektro GmbH");
    await expect(anna.page.getByRole("dialog", { name: "Anruf von 07223 81234" })).toBeVisible();

    await card.getByRole("button", { name: "Annehmen" }).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page).getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 });
    await expect(anna.page.getByRole("dialog", { name: /^Anruf von/ })).toHaveCount(0);
    expect((await box.state()).commands).toContainEqual(
      expect.objectContaining({ type: "answer" }),
    );

    await panel(page).getByRole("button", { name: "Tastenfeld" }).click();
    await expect(panel(page).getByRole("group", { name: "Tastenfeld" })).toBeVisible();

    await panel(page).getByRole("button", { name: "Auflegen" }).click();
    await expect(panel(page)).toHaveCount(0);
    await expect
      .poll(async () => (await box.state()).commands.map((command) => command.type))
      .toContain("hangup");

    await page.getByRole("link", { name: "Telefon", exact: true }).click();
    const list = page.getByRole("list", { name: "Letzte Anrufe" });
    await expect(list.getByRole("listitem").first()).toContainText("Petra Keller");
    await expect(list.getByRole("listitem").first()).toContainText("Angenommen");
    await anna.close();
  });

  test("ein verpasster Anruf steht in der Liste, mit Notiz und Zurückrufen", async ({ page }) => {
    await login(page);
    const { call } = await box.ring("0171 7654321");
    await expect(page.getByRole("dialog", { name: /^Anruf von/ })).toBeVisible();
    await box.hangup(call);
    await expect(page.getByRole("dialog", { name: /^Anruf von/ })).toHaveCount(0);

    await page.getByRole("link", { name: "Telefon", exact: true }).click();
    await page.getByRole("button", { name: "Verpasst" }).click();
    const missed = page.getByRole("list", { name: "Letzte Anrufe" }).getByRole("listitem").first();
    await expect(missed).toContainText("Verpasst");
    await missed.getByLabel("Notiz").fill("Wegen Termin zurückrufen");
    await missed.getByLabel("Notiz").press("Enter");
    await expect(page.getByText("Notiz gespeichert")).toBeVisible();

    // The missed call left a task on Jonas's board …
    await missed.getByRole("link", { name: "Aufgabe „Zurückrufen“ öffnen" }).click();
    await expect(page.getByRole("article", { name: "Zurückrufen: 01717 654321" })).toBeVisible();
    await page.goBack();

    await missed.getByRole("button", { name: "Zurückrufen" }).click();
    await expect(panel(page)).toBeVisible();
    await expect
      .poll(async () => (await box.state()).commands.at(-1))
      .toMatchObject({ type: "dial", number: "01717654321" });
    await expect(panel(page).getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 });
    // … which is done now that someone talked to the number.
    await expect(page.getByRole("link", { name: "Aufgabe „Zurückrufen“ öffnen" })).toHaveCount(0);
    await panel(page).getByRole("button", { name: "Auflegen" }).click();
    await expect(panel(page)).toHaveCount(0);
  });

  test("aus dem Kontakt anrufen geht über die Box", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kontakte" }).first().click();
    await page
      .getByRole("link", { name: /Markus Hoffmann/ })
      .first()
      .click();
    await page.getByRole("button", { name: "Anrufen" }).click();
    await expect(panel(page)).toBeVisible();
    await expect(panel(page)).toContainText("Markus Hoffmann");
    await expect
      .poll(async () => (await box.state()).commands.at(-1))
      .toMatchObject({ type: "dial", number: "0722355678" });
    await panel(page).getByRole("button", { name: "Auflegen" }).click();
    await expect(panel(page)).toHaveCount(0);
  });
});
