import { type Browser, expect } from "@playwright/test";
import { giveKey, PASSPHRASE } from "../../e2e/pgp-key";
import { serverPanel } from "../panels";
import { ADDRESS, closeAll, desktopOf, panelOf } from "../screens";
import { startTake } from "../take";

/** Confidential mail: encrypted to anyone, who opens it with a link and a code. */
export const recordSecureMail = async (browser: Browser) => {
  const page = await desktopOf(browser);
  await giveKey(page, "jonas");
  await page.goto("/mail");
  await page.getByRole("link", { name: "Hoffmann", exact: true }).click();
  await expect(page.getByText("Re: Badsanierung Obergeschoss").first()).toBeVisible();
  await page.getByRole("link", { name: "Neue Mail" }).first().click();
  await page.getByRole("combobox", { name: "An" }).fill("markus.hoffmann@example.test");
  await page.keyboard.press(",");
  await page.getByLabel("Betreff").fill("Ihre Rechnung Badsanierung");
  const take = await startTake("secure-mail", { app: { page, kind: "desktop", label: ADDRESS } });
  const body = page.getByRole("textbox", { name: "Ihre Nachricht …" });
  await body.click();
  await take.type("app", body, "Guten Tag Herr Hoffmann, anbei Ihre Rechnung.", {
    note: "Die Rechnung gehört nicht ins offene Netz",
  });
  await take.click("app", page.getByRole("button", { name: "Vertraulich senden" }), 2.4, {
    until: () =>
      expect(page.getByRole("status").filter({ hasText: "per Link mit Code" })).toBeVisible(),
    note: "Verschlüsselt an jeden – er öffnet sie mit Link und Code",
  });
  await take.save();
  await closeAll(page);
};

/** A confidential chat: Jonas writes to Anna, and the server holds only cipher text. */
export const recordSecureChat = async (browser: Browser) => {
  const anna = await desktopOf(browser, "anna");
  await giveKey(anna, "anna");
  const page = await desktopOf(browser);
  await giveKey(page, "jonas");
  await page.goto("/chat");
  const panel = await panelOf(browser, 520, 820);
  const take = await startTake("secure-chat", {
    app: { page, kind: "desktop", label: ADDRESS },
    server: { page: panel, kind: "panel", label: "Was der Server sieht" },
  });
  await panel.setContent(serverPanel([], "Noch nichts gespeichert."));
  await take.hold("server", 0);
  await take.click("app", page.getByRole("button", { name: "Neue Nachricht" }), 0.6);
  const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
  await take.click("app", dialog.getByText("Anna Weber"), 0.5);
  await take.click("app", dialog.getByLabel(/Vertraulich – Ende-zu-Ende verschlüsselt/), 1.0, {
    focus: dialog,
    pad: 20,
    note: "Vertraulich: Ende-zu-Ende verschlüsselt",
  });
  await take.click("app", dialog.getByRole("button", { name: "Chat beginnen" }), 0.6, {
    until: () => expect(page.getByRole("heading", { name: "Anna Weber" })).toBeVisible(),
    focus: null,
    note: "Vertraulich: Ende-zu-Ende verschlüsselt",
  });
  await page.getByLabel("Passphrase deines Schlüssels").fill(PASSPHRASE);
  await page.getByRole("button", { name: "Entsperren" }).click();
  const field = page.getByRole("textbox", { name: "Nachricht" });
  await field.click();
  await take.type("app", field, "Gehaltsgespräch am Freitag, 10 Uhr?", {
    note: "Vertraulich: Ende-zu-Ende verschlüsselt",
  });
  await take.after(
    "app",
    async () => {
      await page.keyboard.press("Enter");
      await expect(page.getByRole("list", { name: "Nachrichten" })).toContainText(
        "Gehaltsgespräch",
      );
    },
    0.5,
    { note: "Vertraulich: Ende-zu-Ende verschlüsselt" },
  );
  const { channels } = (await (await page.request.get("/api/chat/channels")).json()) as {
    channels: { id: string; confidential: boolean }[];
  };
  const channel = channels.find((candidate) => candidate.confidential)!;
  let stored = "";
  await expect
    .poll(async () => {
      const { messages } = (await (
        await page.request.get(`/api/chat/channels/${channel.id}/messages`)
      ).json()) as { messages: { text: string; call: unknown }[] };
      stored = messages.find((message) => !message.call)?.text ?? "";
      return stored;
    })
    .toMatch(/^-----BEGIN PGP MESSAGE-----/);
  await panel.setContent(
    serverPanel(
      [
        ["channel", channel.id],
        ["from", "jonas@weber-haustechnik.test"],
      ],
      stored,
    ),
  );
  await take.hold("server", 3.0, { note: "Der Server sieht nur Zeichensalat" });
  await take.save();
  await closeAll(page, anna, panel);
};
