import { type Browser, expect } from "@playwright/test";
import { login } from "../../e2e/helpers";
import { cameraFile } from "../camera";
import { ADDRESS } from "../screens";
import { startTake } from "../take";

const common = { locale: "de-DE", timezoneId: "Europe/Berlin" } as const;

/**
 * Chat and video: the site's channel with a mail as a card, a message, then a video call from
 * Jonas at his desk to Anna on her phone. Each has a browser of their own with their own camera.
 */
export const recordChat = async (browser: Browser, channelId: string) => {
  const launch = async (camera: string) =>
    browser.browserType().launch({
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-video-capture=${camera}`,
      ],
    });
  const jonasBrowser = await launch(
    await cameraFile(browser, "jonas", { wall: "#8a7a6a", shirt: "#1f3a5f" }),
  );
  const annaBrowser = await launch(
    await cameraFile(browser, "anna", { wall: "#6a7a8a", shirt: "#7a2f3f", long: true }),
  );
  try {
    const page = await (
      await jonasBrowser.newContext({
        ...common,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      })
    ).newPage();
    await login(page);
    const phone = await (
      await annaBrowser.newContext({
        ...common,
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
      })
    ).newPage();
    await login(phone, "anna");
    await phone.goto("/chat");

    const take = await startTake("chat", {
      app: { page, kind: "desktop", label: ADDRESS },
      phone: { page: phone, kind: "phone", label: "" },
    });
    await page.goto(`/chat?channel=${encodeURIComponent(channelId)}`);
    const messages = page.getByRole("list", { name: "Nachrichten" });
    await expect(messages.getByText("Passt, ich messe morgen früh")).toBeVisible();
    await take.hold("app", 1.4, { note: "Kanäle fürs Team – die Kundenmail als Karte" });
    const field = page.getByRole("textbox", { name: "Nachricht" });
    await field.click();
    await take.type("app", field, "Fliesen kommen Donnerstag 👍", {
      note: "Wie WhatsApp – nur auf deinem Server",
    });
    await take.after(
      "app",
      async () => {
        await page.keyboard.press("Enter");
        await expect(messages.getByText("Fliesen kommen Donnerstag")).toBeVisible();
      },
      0.9,
      { note: "Wie WhatsApp – nur auf deinem Server" },
    );

    await take.click("app", page.getByRole("button", { name: "Neue Nachricht" }), 0.7);
    const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
    await take.click("app", dialog.getByText("Anna Weber"), 0.6);
    await take.click("app", dialog.getByRole("button", { name: "Chat beginnen" }), 0.8, {
      until: () => expect(page.getByRole("heading", { name: "Anna Weber" })).toBeVisible(),
    });
    const panel = page.getByRole("region", { name: /^Gespräch:/ });
    await take.click("app", page.getByRole("button", { name: "Videoanruf" }), 1.0, {
      until: () => expect(panel).toBeVisible(),
      note: "Ein Klick: Videoanruf",
    });
    const ringing = phone.getByRole("dialog", { name: "Jonas Weber ruft an" });
    await take.after("phone", () => expect(ringing).toBeVisible({ timeout: 15_000 }), 1.6, {
      note: "Bei Anna klingelt das Handy",
    });
    await take.click("phone", ringing.getByRole("button", { name: "Annehmen", exact: true }), 0.6, {
      until: () => expect(ringing).toHaveCount(0),
      note: "Bei Anna klingelt das Handy",
    });
    const annasPanel = phone.getByRole("region", { name: /^Gespräch:/ });
    await expect(annasPanel.getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 });
    await take.click("phone", annasPanel.getByRole("button", { name: "Kamera an" }), 0.6, {
      until: () =>
        expect(panel.getByRole("listitem", { name: /^Anna Weber/ }).locator("video")).toBeVisible({
          timeout: 15_000,
        }),
      note: "Bei Anna klingelt das Handy",
    });
    await page.waitForTimeout(1200);
    await take.hold("app", 2.6, {
      note: "Video und Bildschirm teilen – ohne Zoom und Teams",
    });
    await take.save();
    await panel.getByRole("button", { name: "Auflegen" }).click();
  } finally {
    await jonasBrowser.close();
    await annaBrowser.close();
  }
};
