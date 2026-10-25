import { type ChildProcess, spawn } from "node:child_process";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { encodeWav } from "../server/phone/sounds";
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
  ring: async (from: string, line?: string, choice?: string) =>
    (await (
      await fetch(`${CONTROL}/ring`, {
        method: "POST",
        body: JSON.stringify({ from, line, choice }),
      })
    ).json()) as { call: string },
  hangup: (call: string, cause = 16) =>
    fetch(`${CONTROL}/hangup`, { method: "POST", body: JSON.stringify({ call, cause }) }),
  closed: async (from: string) =>
    (await (
      await fetch(`${CONTROL}/closed`, { method: "POST", body: JSON.stringify({ from }) })
    ).json()) as { call: string },
  event: (event: Record<string, string>) =>
    fetch(`${CONTROL}/event`, { method: "POST", body: JSON.stringify(event) }),
  mailbox: (call: string, seconds: number) =>
    fetch(`${CONTROL}/mailbox`, { method: "POST", body: JSON.stringify({ call, seconds }) }),
  state: async () =>
    (await (await fetch(`${CONTROL}/state`)).json()) as {
      connected: boolean;
      config: {
        line: { username: string } | null;
        extraLines: { username: string; password: string }[];
        deskPhones: {
          id: string;
          label: string;
          mac: string;
          extension: string;
          lines: string[];
        }[];
        hours: { open: { day: number; from: string; to: string }[] } | null;
        menu: { options: { digit: string; mailbox: boolean }[] } | null;
        blocked: { numbers: string[]; anonymous: boolean };
        fax: { line: string } | null;
        recording: { notice: string | null } | null;
      } | null;
      commands: { type: string; number?: string; call?: string }[];
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

    // A greeting as an uploaded file (any rate; the browser makes 8 kHz of it).
    const sounds = page.getByRole("region", { name: "Ansagen" });
    await sounds.getByLabel("Name der Ansage").fill("Mailbox Büro");
    await sounds.getByLabel("Datei hochladen").setInputFiles({
      name: "ansage.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from(encodeWav(new Int16Array(16000 * 2), 16000)),
    });
    await expect(sounds.getByRole("listitem")).toContainText("Mailbox Büro · 0:02");
    const mailbox = page.getByRole("region", { name: "Mailbox", exact: true });
    await mailbox.getByLabel("Mailbox einschalten").check();
    await mailbox.getByLabel("Mailbox nach").selectOption({ label: "20 Sekunden Klingeln" });
    await mailbox.getByLabel("Ansage").selectOption({ label: "Mailbox Büro" });
    await mailbox.getByLabel("Nachrichten als Mail an").selectOption({ label: "Jonas Weber" });
    await mailbox.getByRole("button", { name: "Speichern" }).click();

    const hours = page.getByRole("region", { name: "Öffnungszeiten" });
    await hours.getByLabel("Öffnungszeiten beachten").check();
    await expect(hours.getByLabel("Montag von")).toHaveValue("08:00");
    await hours.getByLabel("Samstag", { exact: true }).check();
    await hours.getByLabel("Samstag bis").fill("12:00");
    await hours.getByRole("button", { name: "Feiertage (Baden-Württemberg) eintragen" }).click();
    await expect(hours.getByRole("list", { name: "Geschlossene Tage" })).toContainText(
      "1. Weihnachtstag",
    );
    await hours.getByRole("button", { name: "Speichern" }).click();

    const boxes = page.getByRole("region", { name: "Telefonbox" });
    await boxes.getByRole("button", { name: "Box koppeln" }).click();
    const code = (await boxes.getByText(/^Kopplungscode: /).textContent())!.replace(
      "Kopplungscode: ",
      "",
    );
    await box.start(code);
    await expect.poll(async () => (await box.state()).config?.line?.username).toBe("kontext620");
    expect((await box.state()).config).toMatchObject({
      ringSeconds: 20,
      mailbox: { maxSeconds: 120 },
    });
    await expect
      .poll(async () => (await box.state()).config?.hours?.open)
      .toContainEqual({ day: 6, from: "08:00", to: "12:00" });
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

  test("auf der Mailbox: die Nachricht steht beim Anruf und kommt als Mail", async ({ page }) => {
    await login(page);
    const { call } = await box.ring("07223 5550123");
    await expect(page.getByRole("dialog", { name: /^Anruf von/ })).toBeVisible();
    await box.mailbox(call, 5);
    await expect(page.getByRole("dialog", { name: /^Anruf von/ })).toHaveCount(0);

    await page.getByRole("link", { name: "Telefon", exact: true }).click();
    const item = page.getByRole("list", { name: "Letzte Anrufe" }).getByRole("listitem").first();
    await expect(item).toContainText("Nachricht 0:05");
    await expect(item.getByLabel("Nachricht 0:05")).toBeVisible();

    const subject = "Nachricht von 07223 5550123 (0:05)";
    // The mail comes through Stalwart; the inbox is opened again until it is there.
    await expect(async () => {
      await page.goto("/mail");
      await expect(page.getByRole("list", { name: "Posteingang" }).getByText(subject)).toBeVisible({
        timeout: 5_000,
      });
    }).toPass({ timeout: 30_000 });
  });

  test("außerhalb der Öffnungszeiten klingelt nichts, der Anruf steht in der Liste", async ({
    page,
  }) => {
    await login(page);
    const { call } = await box.closed("0711 2223334");
    await box.hangup(call);
    await page.getByRole("link", { name: "Telefon", exact: true }).click();
    const item = page.getByRole("list", { name: "Letzte Anrufe" }).getByRole("listitem").first();
    await expect(item).toContainText("07112 223334");
    await expect(item).toContainText("Außerhalb der Öffnungszeiten");
    await expect(page.getByRole("dialog", { name: /^Anruf von/ })).toHaveCount(0);
  });

  test("eine Nummer sperren: die Box weist sie ab, die Liste zeigt es", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Telefon", exact: true }).click();
    const item = page
      .getByRole("list", { name: "Letzte Anrufe" })
      .getByRole("listitem")
      .filter({ hasText: "07112 223334" })
      .first();
    await item.getByRole("button", { name: "Sperren" }).click();
    await expect(page.getByText("07112 223334 wird ab jetzt abgewiesen.")).toBeVisible();
    await expect
      .poll(async () => (await box.state()).config?.blocked?.numbers)
      .toContain("07112223334");
    await box.event({ state: "blocked", remote: "07112223334" });
    await expect(
      page.getByRole("list", { name: "Letzte Anrufe" }).getByRole("listitem").first(),
    ).toContainText("Gesperrt");
  });

  test("weitervermitteln an Anna: es klingelt bei ihr, sie nimmt an, Jonas ist raus", async ({
    page,
    browser,
  }) => {
    await login(page);
    const anna = await colleague(browser, "anna");
    const { call } = await box.ring("07223 81234");
    await page
      .getByRole("dialog", { name: "Anruf von Petra Keller" })
      .getByRole("button", { name: "Annehmen" })
      .click();
    await expect(panel(page).getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 });

    await panel(page).getByRole("button", { name: "Weitervermitteln" }).click();
    await panel(page).getByRole("button", { name: "Anna Weber" }).click();
    await expect(panel(page)).toContainText("Klingelt bei Anna Weber …");
    const handed = anna.page.getByRole("dialog", { name: "Jonas Weber verbindet: 07223 81234" });
    await expect(handed).toBeVisible();
    await handed.getByRole("button", { name: "Annehmen" }).click();
    await expect(panel(anna.page)).toBeVisible();
    // Once Anna is in the call, Jonas's panel goes; the call goes on.
    await expect(panel(page)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText("An Anna Weber übergeben")).toBeVisible();
    expect((await box.state()).commands).not.toContainEqual({ type: "hangup", call });

    await panel(anna.page).getByRole("button", { name: "Auflegen" }).click();
    await expect
      .poll(async () => (await box.state()).commands)
      .toContainEqual({ type: "hangup", call });
    await anna.close();
  });

  test("weitervermitteln an eine Nummer: die Box wählt sie dazu, Jonas übergibt", async ({
    page,
  }) => {
    await login(page);
    const { call } = await box.ring("07223 81234");
    await page
      .getByRole("dialog", { name: "Anruf von Petra Keller" })
      .getByRole("button", { name: "Annehmen" })
      .click();
    await expect(panel(page).getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 });

    await panel(page).getByRole("button", { name: "Weitervermitteln" }).click();
    await panel(page).getByLabel("Nummer zum Weitervermitteln").fill("0171 2345678");
    await panel(page).getByRole("button", { name: "Anrufen" }).click();
    await expect
      .poll(async () => (await box.state()).commands.at(-1))
      .toMatchObject({ type: "dial", number: "01712345678" });
    const line = panel(page).getByRole("listitem").filter({ hasText: "01712 345678" });
    await expect(line).toContainText("verbunden");
    await line.getByRole("button", { name: "Übergeben" }).click();
    await expect(panel(page)).toHaveCount(0);
    const dialled = (await box.state()).commands.at(-1) as { call: string };

    // When the caller hangs up, nobody is left for the mobile phone: it is hung up too.
    await box.hangup(call);
    await expect
      .poll(async () => (await box.state()).commands)
      .toContainEqual({ type: "hangup", call: dialled.call });
  });

  test("halten, Anna dazuholen, dann verlässt Jonas das Gespräch", async ({ page, browser }) => {
    await login(page);
    const anna = await colleague(browser, "anna");
    const { call } = await box.ring("07223 81234");
    await page
      .getByRole("dialog", { name: "Anruf von Petra Keller" })
      .getByRole("button", { name: "Annehmen" })
      .click();
    await expect(panel(page).getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 });

    await panel(page).getByRole("button", { name: "Halten" }).click();
    await expect(panel(page).getByRole("status")).toHaveText(/^Gehalten/);
    await expect
      .poll(async () => (await box.state()).commands.at(-1))
      .toEqual({ type: "hold", call });

    await panel(page).getByRole("button", { name: "Weitervermitteln" }).click();
    await panel(page).getByText("Dazuholen", { exact: true }).click();
    await expect(panel(page).getByRole("radio", { name: "Dazuholen" })).toBeChecked();
    await panel(page).getByRole("button", { name: "Anna Weber" }).click();
    const asked = anna.page.getByRole("dialog", {
      name: "Jonas Weber holt dich dazu: 07223 81234",
    });
    await asked.getByRole("button", { name: "Annehmen" }).click();
    await expect(panel(anna.page)).toBeVisible();
    // Asked to join, not handed over: Jonas stays until he leaves.
    await expect(panel(page).getByRole("button", { name: "Gespräch verlassen" })).toBeVisible({
      timeout: 15_000,
    });

    await panel(page).getByRole("button", { name: "Fortsetzen" }).click();
    await expect
      .poll(async () => (await box.state()).commands.at(-1))
      .toMatchObject({
        type: "resume",
        call,
      });
    await panel(page).getByRole("button", { name: "Gespräch verlassen" }).click();
    await expect(panel(page)).toHaveCount(0);
    expect((await box.state()).commands).not.toContainEqual({ type: "hangup", call });
    await panel(anna.page).getByRole("button", { name: "Auflegen" }).click();
    await expect
      .poll(async () => (await box.state()).commands)
      .toContainEqual({ type: "hangup", call });
    await anna.close();
  });

  test("ein Gespräch aufnehmen: erst die Ansage, die Aufnahme steht beim Anruf", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings?section=phone");
    const settings = page.getByRole("region", { name: "Gespräche aufnehmen" });
    await settings.getByLabel("Aufnehmen erlauben").check();
    await settings
      .getByRole("combobox", { name: /^Ansage vor der Aufnahme/ })
      .selectOption({ label: "Mailbox Büro" });
    await settings.getByRole("button", { name: "Speichern" }).click();
    await expect
      .poll(async () => (await box.state()).config?.recording?.notice)
      .toMatch(/^[0-9a-f]{24}$/);

    await page.goto("/");
    const { call } = await box.ring("07223 81234");
    await page
      .getByRole("dialog", { name: "Anruf von Petra Keller" })
      .getByRole("button", { name: "Annehmen" })
      .click();
    await expect(panel(page).getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 });
    await panel(page).getByRole("button", { name: "Aufnehmen" }).click();
    await expect(panel(page).getByRole("button", { name: "Aufnahme beenden" })).toBeVisible();
    await expect
      .poll(async () => (await box.state()).commands.at(-1))
      .toMatchObject({ type: "record", call });
    await panel(page).getByRole("button", { name: "Aufnahme beenden" }).click();
    await expect
      .poll(async () => (await box.state()).commands.at(-1))
      .toEqual({ type: "record-stop", call });
    await panel(page).getByRole("button", { name: "Auflegen" }).click();

    await page.getByRole("link", { name: "Telefon", exact: true }).click();
    const first = page.getByRole("list", { name: "Letzte Anrufe" }).getByRole("listitem").first();
    await expect(first).toContainText("Aufnahme 0:03");
  });

  test("Bitte nicht stören: bei Jonas klingelt nichts, bei Anna schon", async ({
    page,
    browser,
  }) => {
    await login(page);
    await page.getByRole("link", { name: "Telefon", exact: true }).click();
    await page.getByLabel("Erreichbarkeit").selectOption({ label: "Bitte nicht stören" });
    const anna = await colleague(browser, "anna");
    const { call } = await box.ring("07223 81234");
    await expect(anna.page.getByRole("dialog", { name: /^Anruf von/ })).toBeVisible();
    await expect(page.getByRole("dialog", { name: /^Anruf von/ })).toHaveCount(0);
    await box.hangup(call);
    await page.getByLabel("Erreichbarkeit").selectOption({ label: "Erreichbar" });
    await anna.close();
  });

  test("Sprachmenü: wer die 1 drückt, landet beim Kundendienst (Anna)", async ({
    page,
    browser,
  }) => {
    await login(page);
    await page.goto("/settings?section=phone");
    const menu = page.getByRole("region", { name: "Sprachmenü" });
    await menu.getByLabel("Sprachmenü einschalten").check();
    await menu
      .getByRole("combobox", { name: /^Ansage des Menüs/ })
      .selectOption({ label: "Mailbox Büro" });
    await menu.getByRole("button", { name: "Taste hinzufügen" }).click();
    const key = menu.getByRole("group", { name: "Taste 1" });
    await key.getByLabel("Wofür").fill("Kundendienst");
    await key.getByLabel("Anna Weber").check();
    await menu.getByRole("button", { name: "Speichern" }).click();
    await expect
      .poll(async () => (await box.state()).config?.menu)
      .toMatchObject({ options: [{ digit: "1", mailbox: false }] });

    const anna = await colleague(browser, "anna");
    const { call } = await box.ring("07223 81234", undefined, "1");
    await expect(anna.page.getByRole("dialog", { name: /^Anruf von/ })).toContainText(
      "Kundendienst",
    );
    await expect(page.getByRole("dialog", { name: /^Anruf von/ })).toHaveCount(0);
    await box.hangup(call);
    await anna.close();
  });

  test("eine Durchwahl klingelt nur bei Anna", async ({ page, browser }) => {
    await login(page);
    await page.goto("/settings?section=phone");
    const lines = page.getByRole("region", { name: "Weitere Rufnummern" });
    await lines.getByRole("button", { name: "Rufnummer hinzufügen" }).click();
    const line = lines.getByRole("group", { name: "Neue Rufnummer" });
    await line.getByLabel("Name", { exact: true }).fill("Durchwahl Anna");
    const named = lines.getByRole("group", { name: "Durchwahl Anna" });
    await named.getByLabel("Benutzername").fill("kontext621");
    await named.getByLabel("Kennwort").fill("zwei");
    await named.getByLabel("Anna Weber").check();
    await lines.getByRole("button", { name: "Speichern" }).click();
    await expect
      .poll(async () => (await box.state()).config)
      .toMatchObject({ extraLines: [{ username: "kontext621", password: "zwei" }] });

    const anna = await colleague(browser, "anna");
    const { call } = await box.ring("07223 81234", "kontext621");
    await expect(anna.page.getByRole("dialog", { name: /^Anruf von/ })).toContainText(
      "Durchwahl Anna",
    );
    await expect(page.getByRole("dialog", { name: /^Anruf von/ })).toHaveCount(0);
    await box.hangup(call);
    await anna.close();
  });

  test("ein Fax auf der Faxnummer kommt als PDF und als Mail", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=phone");
    const fax = page.getByRole("region", { name: "Fax", exact: true });
    await fax.getByLabel("Faxe empfangen").check();
    await fax
      .getByRole("combobox", { name: /^Faxnummer/ })
      .selectOption({ label: "Durchwahl Anna" });
    await fax
      .getByRole("combobox", { name: /^Faxe als Mail an/ })
      .selectOption({ label: "Jonas Weber" });
    await fax.getByRole("button", { name: "Speichern" }).click();
    await expect.poll(async () => (await box.state()).config?.fax).toEqual({ line: "kontext621" });

    await fetch(`${CONTROL}/fax`, {
      method: "POST",
      body: JSON.stringify({ from: "07223 5550199" }),
    });
    await page.getByRole("link", { name: "Telefon", exact: true }).click();
    const item = page.getByRole("list", { name: "Letzte Anrufe" }).getByRole("listitem").first();
    await expect(item).toContainText("Fax");
    await expect(item.getByRole("link", { name: "Fax öffnen (PDF)" })).toBeVisible();
    await expect(async () => {
      await page.goto("/mail");
      await expect(
        page
          .getByRole("list", { name: "Posteingang" })
          .getByText("Fax von 07223 5550199", { exact: true }),
      ).toBeVisible({ timeout: 5_000 });
    }).toPass({ timeout: 30_000 });
  });

  test("ein Tischtelefon an der Box: richtet sich ein und nimmt Anrufe an", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=phone");
    const desks = page.getByRole("region", { name: "Tischtelefone" });
    await desks.getByRole("button", { name: "Tischtelefon hinzufügen" }).click();
    const desk = desks.getByRole("group", { name: "Neues Tischtelefon" });
    await desk.getByLabel("MAC-Adresse").fill("00:04:13:A1:B2:C3");
    await expect(desk.getByLabel("Kurzwahl")).toHaveValue("21");
    await desk.getByLabel("Name").fill("Empfang");
    await desks.getByRole("button", { name: "Speichern" }).click();
    await expect(desks).toContainText("http://<box>:8089/snom/000413a1b2c3.xml");
    await expect
      .poll(async () => (await box.state()).config?.deskPhones?.[0])
      .toMatchObject({
        label: "Empfang",
        mac: "000413a1b2c3",
        extension: "21",
        lines: ["kontext620"],
      });
    const { id } = (await box.state()).config!.deskPhones[0]!;

    const { call } = await box.ring("07223 81234");
    await expect(page.getByRole("dialog", { name: /^Anruf von/ })).toBeVisible();
    await box.event({ call, state: "answered", desk: id });
    await expect(page.getByRole("dialog", { name: /^Anruf von/ })).toHaveCount(0);
    await box.hangup(call);
    await page.getByRole("link", { name: "Telefon", exact: true }).click();
    await expect(
      page.getByRole("list", { name: "Letzte Anrufe" }).getByRole("listitem").first(),
    ).toContainText("Am Tischtelefon angenommen (Empfang)");
  });

  test("die Auswertung zeigt Anrufe, Verpasste nach Uhrzeit und wer angenommen hat", async ({
    page,
  }) => {
    await login(page);
    await page.getByRole("link", { name: "Telefon", exact: true }).click();
    await page.getByRole("button", { name: "Auswertung" }).click();
    const stats = page.getByRole("region", { name: "Auswertung" });
    await expect(stats).toContainText("Anrufe in 30 Tagen");
    await expect(stats).toContainText("Wann Anrufe verpasst wurden");
    await expect(stats.getByRole("listitem").filter({ hasText: "Jonas Weber" })).toBeVisible();
    await expect(stats.locator("td[style]").first()).toBeVisible();
  });

  test("die Türsprechstelle klingelt bei Anna, sie öffnet die Tür", async ({ page, browser }) => {
    await login(page);
    await page.goto("/settings?section=phone");
    const door = page.getByRole("region", { name: "Türsprechstelle" });
    await door.getByLabel("Türsprechstelle in Kontext klingeln lassen").check();
    await door.getByLabel("Anna Weber").check();
    await door.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Gespeichert").first()).toBeVisible();

    const anna = await colleague(browser, "anna");
    const { call } = await box.ring("**11");
    const card = anna.page.getByRole("dialog", { name: "Es klingelt an der Tür" });
    await card.getByRole("button", { name: "Tür öffnen" }).click();
    await expect
      .poll(async () => (await box.state()).commands.at(-1))
      .toEqual({ type: "door-open", call, code: "#" });
    await anna.page.getByRole("link", { name: "Telefon", exact: true }).click();
    await expect(
      anna.page.getByRole("list", { name: "Letzte Anrufe" }).getByRole("listitem").first(),
    ).toContainText("Tür geöffnet");
    await anna.close();
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

  test("der Reihe nach: erst Jonas, dann Anna, und nach einer Weile das Handy", async ({
    page,
    browser,
  }) => {
    await login(page);
    await page.goto("/settings?section=phone");
    const ring = page.getByRole("region", { name: "Wer klingelt" });
    await ring
      .getByRole("combobox", { name: /^Klingeln/ })
      .selectOption({ label: "Der Reihe nach, dann bei allen" });
    await expect(ring.getByRole("list", { name: "Reihenfolge" })).toContainText("Jonas Weber");
    await ring.getByLabel("Jeweils").selectOption({ label: "10 Sekunden" });
    await ring.getByLabel("Auch auf einem Handy klingeln lassen").check();
    await ring.getByLabel("Handynummer").fill("0171 2345678");
    await ring.getByRole("combobox", { name: /^Nach/ }).selectOption({ label: "10 Sekunden" });
    await ring.getByRole("button", { name: "Speichern" }).click();
    await expect
      .poll(async () => (await box.state()).config)
      .toMatchObject({ forward: { number: "01712345678", afterSeconds: 10 } });

    const anna = await colleague(browser, "anna");
    const { call } = await box.ring("07223 81234");
    await expect(page.getByRole("dialog", { name: "Anruf von Petra Keller" })).toBeVisible();
    await expect(anna.page.getByRole("dialog", { name: /^Anruf von/ })).toHaveCount(0);
    // After ten seconds it is Anna's turn.
    await expect(anna.page.getByRole("dialog", { name: /^Anruf von/ })).toBeVisible({
      timeout: 15_000,
    });
    await box.hangup(call);
    await anna.close();
  });
});
