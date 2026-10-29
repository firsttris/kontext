import { type Browser, expect } from "@playwright/test";
import { login } from "../../e2e/helpers";
import { cameraFile } from "../camera";
import { say, ui, uiPattern } from "../language";
import { ADDRESS, common } from "../screens";
import { startTake } from "../take";

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
    const messages = page.getByRole("list", { name: ui("chat_messages") });
    await expect(messages.getByText("Passt, ich messe morgen früh")).toBeVisible();
    await take.hold("app", 1.4, {
      note: say(
        "Kanäle fürs Team – die Kundenmail als Karte",
        "Channels for the team – the customer’s email as a card",
      ),
    });
    const field = page.getByRole("textbox", { name: ui("chat_message") });
    await field.click();
    const ownServer = say(
      "Wie WhatsApp – nur auf deinem Server",
      "Like WhatsApp – on your own server",
    );
    const tiles = say("Fliesen kommen Donnerstag", "Tiles arrive Thursday");
    await take.type("app", field, `${tiles}, ${say("passt!", "all good!")}`, { note: ownServer });
    await take.after(
      "app",
      async () => {
        await page.keyboard.press("Enter");
        await expect(messages.getByText(tiles)).toBeVisible();
      },
      0.9,
      { note: ownServer },
    );

    await take.click("app", page.getByRole("button", { name: ui("chat_new") }), 0.7);
    const dialog = page.getByRole("dialog", { name: ui("chat_new") });
    await take.click("app", dialog.getByText("Anna Weber"), 0.6);
    await take.click("app", dialog.getByRole("button", { name: ui("chat_start") }), 0.8, {
      until: () => expect(page.getByRole("heading", { name: "Anna Weber" })).toBeVisible(),
    });
    const panel = page.getByRole("region", { name: uiPattern("call_panel") });
    await take.click("app", page.getByRole("button", { name: ui("call_video") }), 1.0, {
      until: () => expect(panel).toBeVisible(),
      note: say("Ein Klick: Videoanruf", "One click: video call"),
    });
    const ringing = phone.getByRole("dialog", {
      name: ui("call_incoming", { name: "Jonas Weber" }),
    });
    const rings = say("Bei Anna klingelt das Handy", "Anna’s phone rings");
    await take.after("phone", () => expect(ringing).toBeVisible({ timeout: 15_000 }), 1.6, {
      note: rings,
    });
    await take.click(
      "phone",
      ringing.getByRole("button", { name: ui("call_answer"), exact: true }),
      0.6,
      {
        until: () => expect(ringing).toHaveCount(0),
        note: rings,
      },
    );
    const annasPanel = phone.getByRole("region", { name: uiPattern("call_panel") });
    await expect(annasPanel.getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 });
    await take.click("phone", annasPanel.getByRole("button", { name: ui("call_camera_on") }), 0.6, {
      until: () =>
        expect(panel.getByRole("listitem", { name: /^Anna Weber/ }).locator("video")).toBeVisible({
          timeout: 15_000,
        }),
      note: rings,
    });
    await page.waitForTimeout(1200);
    await take.hold("app", 2.6, {
      note: say(
        "Video und Bildschirm teilen – ohne Zoom und Teams",
        "Video and screen sharing – without Zoom or Teams",
      ),
    });
    await take.save();
    await panel.getByRole("button", { name: ui("call_leave") }).click();
  } finally {
    await jonasBrowser.close();
    await annaBrowser.close();
  }
};
