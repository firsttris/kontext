import { type Browser, expect } from "@playwright/test";
import { closeAll, mailShown, phoneOf } from "../screens";
import { startTake } from "../take";

/** On the phone: mail, calendar and chat, each a tap away, with the tab bar. */
export const recordPhones = async (browser: Browser) => {
  const mail = await phoneOf(browser);
  const calendar = await phoneOf(browser);
  const chat = await phoneOf(browser);
  await expect(mail.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
  await calendar.goto("/calendar");
  await expect(calendar.getByText("Baubesprechung Hoffmann")).toBeVisible();
  await chat.goto("/chat");
  const take = await startTake("phones", {
    mail: { page: mail, kind: "phone", label: "" },
    calendar: { page: calendar, kind: "phone", label: "" },
    chat: { page: chat, kind: "phone", label: "" },
  });
  const note = "Am Handy wie eine App – ohne App Store";
  await take.hold("mail", 0, { note });
  await take.hold("calendar", 0, { note });
  await take.hold("chat", 0.8, { note });
  await take.click("mail", mail.getByText("Angebot Wartungsvertrag 2027"), 1.0, {
    until: () => mailShown(mail),
    note,
  });
  await take.click(
    "calendar",
    calendar.getByText("Baubesprechung Hoffmann", { exact: true }).first(),
    1.0,
    {
      until: () => calendar.waitForTimeout(600),
      note,
    },
  );
  await take.click("chat", chat.getByRole("link", { name: /baustelle-hoffmann/ }).first(), 2.2, {
    until: () =>
      expect(
        chat.getByRole("list", { name: "Nachrichten" }).getByText("Passt, ich messe"),
      ).toBeVisible(),
    note: "Mit Benachrichtigungen – auf iPhone und Android",
  });
  await take.save();
  await closeAll(mail, calendar, chat);
};
