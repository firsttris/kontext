import { type Browser, expect } from "@playwright/test";
import { giveKey, PASSPHRASE } from "../../e2e/pgp-key";
import { say, ui, uiPattern } from "../language";
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
  await page
    .getByRole("link", { name: ui("mail_compose") })
    .first()
    .click();
  await page.getByRole("combobox", { name: ui("mail_to") }).fill("markus.hoffmann@example.test");
  await page.keyboard.press(",");
  await page
    .getByLabel(ui("mail_subject"))
    .fill(say("Ihre Rechnung Badsanierung", "Your invoice for the bathroom renovation"));
  const take = await startTake("secure-mail", { app: { page, kind: "desktop", label: ADDRESS } });
  const body = page.getByRole("textbox", { name: ui("mail_body_placeholder") });
  await body.click();
  await take.type(
    "app",
    body,
    say(
      "Guten Tag Herr Hoffmann, anbei Ihre Rechnung.",
      "Dear Mr Hoffmann, please find your invoice attached.",
    ),
    {
      note: say(
        "Die Rechnung gehört nicht ins offene Netz",
        "An invoice doesn’t belong on the open web",
      ),
    },
  );
  await take.click("app", page.getByRole("button", { name: ui("pgp_send_toggle") }), 2.4, {
    until: () =>
      expect(
        page.getByRole("status").filter({ hasText: uiPattern("secure_part_link") }),
      ).toBeVisible(),
    note: say(
      "Verschlüsselt an jeden – er öffnet sie mit Link und Code",
      "Encrypted to anyone – they open it with a link and a code",
    ),
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
    server: {
      page: panel,
      kind: "panel",
      label: say("Was der Server sieht", "What the server sees"),
    },
  });
  await panel.setContent(serverPanel([], say("Noch nichts gespeichert.", "Nothing stored yet.")));
  await take.hold("server", 0);
  await take.click("app", page.getByRole("button", { name: ui("chat_new") }), 0.6);
  const dialog = page.getByRole("dialog", { name: ui("chat_new") });
  await take.click("app", dialog.getByText("Anna Weber"), 0.5);
  const note = say("Vertraulich: Ende-zu-Ende verschlüsselt", "Confidential: end-to-end encrypted");
  await take.click("app", dialog.getByLabel(ui("chat_confidential_toggle")), 1.0, {
    focus: dialog,
    pad: 20,
    note,
  });
  await take.click("app", dialog.getByRole("button", { name: ui("chat_start") }), 0.6, {
    until: () => expect(page.getByRole("heading", { name: "Anna Weber" })).toBeVisible(),
    focus: null,
    note,
  });
  await page.getByLabel(ui("pgp_unlock_passphrase")).fill(PASSPHRASE);
  await page.getByRole("button", { name: ui("pgp_unlock") }).click();
  const field = page.getByRole("textbox", { name: ui("chat_message") });
  await field.click();
  const salary = say("Gehaltsgespräch", "Salary review");
  await take.type("app", field, `${salary} ${say("am Freitag, 10 Uhr?", "on Friday at 10?")}`, {
    note,
  });
  await take.after(
    "app",
    async () => {
      await page.keyboard.press("Enter");
      await expect(page.getByRole("list", { name: ui("chat_messages") })).toContainText(salary);
    },
    0.5,
    { note },
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
  await take.hold("server", 3.0, {
    note: say("Der Server sieht nur Zeichensalat", "The server sees only gibberish"),
  });
  await take.save();
  await closeAll(page, anna, panel);
};
