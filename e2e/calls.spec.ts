import { type Browser, expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

/**
 * Calls through the e2e LiveKit (dev/livekit.ts on 27880). Chromium brings a test pattern as
 * camera and a tone as microphone (playwright.config.ts), so the media really flow.
 */

/** A second person in a browser of their own; closed at the end so no call outlives a test. */
const colleague = async (browser: Browser, user: string) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, user);
  return { page, close: () => context.close() };
};

const openDirect = async (page: Page, name: string) => {
  await page.getByRole("link", { name: /^Chat/ }).first().click();
  await page.getByRole("button", { name: "Neue Nachricht" }).click();
  const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
  await dialog.getByText(name).click();
  await dialog.getByRole("button", { name: "Chat beginnen" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
};

const callPanel = (page: Page) => page.getByRole("region", { name: /^Gespräch:/ });

test.describe("Anrufe", () => {
  test("Videoanruf: es klingelt, Anna nimmt an, beide sehen sich, Jonas legt auf", async ({
    page,
    browser,
  }) => {
    await login(page);
    const anna = await colleague(browser, "anna");
    await openDirect(page, "Anna Weber");

    await page.getByRole("button", { name: "Videoanruf" }).click();
    const panel = callPanel(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("status")).toHaveText("Klingelt bei Anna …", { timeout: 15_000 });

    const ringing = anna.page.getByRole("dialog", { name: "Jonas Weber ruft an" });
    await expect(ringing).toBeVisible();
    await expect(ringing).toContainText("Videoanruf");
    await expect(ringing).toHaveCSS("padding-top", "16px");
    await ringing.getByRole("button", { name: "Annehmen", exact: true }).click();
    await expect(ringing).toHaveCount(0);

    const annasPanel = callPanel(anna.page);
    await expect(annasPanel).toBeVisible();
    // Talking: the duration runs, and each sees the other's tile.
    await expect(panel.getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 });
    await expect(panel.getByRole("listitem", { name: /^Anna Weber/ })).toBeVisible();
    await expect(annasPanel.getByRole("listitem", { name: /^Jonas Weber/ })).toBeVisible();
    // Jonas' camera is on (he called with video), so his own tile shows it.
    await expect(panel.getByRole("listitem", { name: /^Du/ }).locator("video")).toBeVisible();

    await panel.getByRole("button", { name: "Mikrofon aus" }).click();
    await expect(panel.getByRole("button", { name: "Mikrofon an" })).toBeVisible();
    await expect(annasPanel.getByRole("listitem", { name: "Jonas Weber, stumm" })).toBeVisible();

    // The call stays while switching apps.
    await page.getByRole("link", { name: /^Mail/ }).first().click();
    await expect(panel).toBeVisible();

    await panel.getByRole("button", { name: "Auflegen" }).click();
    await expect(panel).toHaveCount(0);
    // The other side hung up: Anna's call ends too.
    await expect(annasPanel).toHaveCount(0, { timeout: 15_000 });
    // Both conversations keep a line of the call.
    await page.getByRole("link", { name: /^Chat/ }).first().click();
    await page
      .getByRole("navigation", { name: "Direktnachrichten" })
      .first()
      .getByRole("link", { name: /Anna Weber/ })
      .click();
    await expect(page.getByRole("list", { name: "Nachrichten" })).toContainText(
      /Videoanruf · (unter 1|\d+) Min/,
      { timeout: 15_000 },
    );
    await anna.close();
  });

  test("Ablehnen beendet das Klingeln beim Anrufer", async ({ page, browser }) => {
    await login(page);
    const sandra = await colleague(browser, "sandra");
    await openDirect(page, "Sandra Klein");

    await page.getByRole("button", { name: "Anrufen", exact: true }).click();
    const ringing = sandra.page.getByRole("dialog", { name: "Jonas Weber ruft an" });
    await expect(ringing).toContainText("Anruf");
    await ringing.getByRole("button", { name: "Ablehnen" }).click();
    await expect(ringing).toHaveCount(0);

    const panel = callPanel(page);
    await expect(panel.getByRole("status")).toHaveText("Abgelehnt");
    await expect(panel).toHaveCount(0, { timeout: 10_000 });

    // Nobody answered: "Keine Antwort" for Jonas, "Verpasster Anruf" with a way back for Sandra.
    const history = page.getByRole("list", { name: "Nachrichten" });
    await expect(history).toContainText("Keine Antwort", { timeout: 15_000 });
    await sandra.page.getByRole("link", { name: /^Chat/ }).first().click();
    await sandra.page
      .getByRole("navigation", { name: "Direktnachrichten" })
      .first()
      .getByRole("link", { name: /Jonas Weber/ })
      .click();
    const missed = sandra.page.getByRole("list", { name: "Nachrichten" });
    await expect(missed).toContainText("Verpasster Anruf");
    await missed.getByRole("button", { name: "Zurückrufen" }).last().click();
    await expect(page.getByRole("dialog", { name: "Sandra Klein ruft an" })).toBeVisible();
    await callPanel(sandra.page).getByRole("button", { name: "Auflegen" }).click();
    await expect(page.getByRole("dialog", { name: "Sandra Klein ruft an" })).toHaveCount(0, {
      timeout: 15_000,
    });
    await sandra.close();
  });

  test("Besprechung im Kanal: keiner klingelt, Max tritt bei", async ({ page, browser }) => {
    await login(page);
    const max = await colleague(browser, "max");
    for (const person of [page, max.page]) {
      await person.getByRole("link", { name: /^Chat/ }).first().click();
      await person
        .getByRole("navigation", { name: "Kanäle" })
        .first()
        .getByRole("link", { name: /allgemein/ })
        .click();
    }

    await page.getByRole("button", { name: "Besprechung starten", exact: true }).click();
    await expect(callPanel(page)).toBeVisible();
    const join = max.page.getByRole("button", { name: /Beitreten/ });
    await expect(join).toContainText("1", { timeout: 15_000 });
    await expect(max.page.getByRole("dialog", { name: /ruft an/ })).toHaveCount(0);

    await join.click();
    await expect(callPanel(max.page)).toBeVisible();
    await expect(callPanel(page).getByRole("listitem", { name: /^Max Becker/ })).toBeVisible({
      timeout: 15_000,
    });
    // A meeting goes on when one leaves.
    await callPanel(page).getByRole("button", { name: "Auflegen" }).click();
    await expect(callPanel(max.page).getByRole("status")).toHaveText(/^\d+:\d\d$/);
    await expect(page.getByRole("button", { name: /Beitreten/ })).toContainText("1", {
      timeout: 15_000,
    });
    await callPanel(max.page).getByRole("button", { name: "Auflegen" }).click();
    await expect(page.getByRole("button", { name: /Beitreten/ })).toHaveCount(0, {
      timeout: 15_000,
    });
    await max.close();
  });
});

test.describe("Anrufe am Handy @phone", () => {
  test("ein Gespräch füllt den Bildschirm", async ({ page }) => {
    await login(page);
    await page
      .getByRole("navigation", { name: "Apps" })
      .getByRole("link", { name: /^Chat/ })
      .click();
    await page
      .getByRole("navigation", { name: "Kanäle" })
      .getByRole("link", { name: /allgemein/ })
      .click();
    await page.getByRole("button", { name: "Besprechung starten", exact: true }).click();
    const panel = callPanel(page);
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(box?.width).toBe(viewport?.width);
    expect(box?.height).toBe(viewport?.height);
    // No screen sharing on the phone.
    await expect(panel.getByRole("button", { name: "Bildschirm teilen" })).toBeHidden();
    await panel.getByRole("button", { name: "Auflegen" }).click();
    await expect(panel).toHaveCount(0);
  });
});

test.describe("Videobesprechung per Link", () => {
  test("am Termin anlegen; ein Gast wartet, bis Jonas da ist, und kommt dann dazu", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
    const title = `Abnahme online ${Date.now()}`;
    await login(page);
    await page.goto(`/calendar?date=${day}&event=new&start=${day}T16:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").fill(title);
    await dialog.getByRole("button", { name: "Videobesprechung hinzufügen" }).click();
    await expect(dialog.getByText(/^http.*\/meet\//)).toBeVisible();
    // The link also goes into the notes, for guests' mail programs.
    await expect(dialog.getByLabel("Notizen")).toHaveValue(/^Videobesprechung: http.*\/meet\//);
    await dialog.getByRole("button", { name: "Speichern" }).click();

    await page.locator(`[data-day="${day}"]`).getByText(title).click();
    const join = page.getByRole("link", { name: "Beitreten" });
    const link = String(await join.getAttribute("href"));
    expect(link).toMatch(/\/meet\/[A-Za-z0-9_-]{16,}$/);
    const path = new URL(link).pathname;

    // A guest without an account: no way in before someone of the company is there.
    const guest = await (await browser.newContext()).newPage();
    await guest.goto(path);
    await expect(guest.getByRole("status")).toContainText("noch nicht begonnen");
    await guest.getByLabel("Dein Name").fill("Frau Hoffmann");
    await expect(guest.getByRole("button", { name: "Beitreten" })).toBeDisabled();

    await page.goto(path);
    await page.getByRole("button", { name: "Beitreten" }).click();
    const room = page.getByRole("region", { name: "Videobesprechung" });
    await expect(room).toBeVisible();

    await expect(guest.getByRole("status")).toHaveText("Die Besprechung läuft.", {
      timeout: 15_000,
    });
    await guest.getByRole("button", { name: "Beitreten" }).click();
    await expect(guest.getByRole("region", { name: "Videobesprechung" })).toBeVisible();
    await expect(room.getByRole("listitem", { name: /^Frau Hoffmann · Gast/ })).toBeVisible({
      timeout: 15_000,
    });

    await guest.getByRole("button", { name: "Auflegen" }).click();
    await expect(guest.getByRole("status")).toHaveText("Du hast die Besprechung verlassen.");
    await room.getByRole("button", { name: "Auflegen" }).click();
    await guest.context().close();
  });
});
