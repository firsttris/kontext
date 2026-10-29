import { type Browser, expect } from "@playwright/test";
import { say, ui } from "../language";
import { closeAll, mailShown, phoneOf } from "../screens";
import { startTake } from "../take";

/** On the phone: mail, calendar and chat, each a tap away, with the tab bar. */
export const recordPhones = async (browser: Browser) => {
  const mail = await phoneOf(browser);
  const calendar = await phoneOf(browser);
  const chat = await phoneOf(browser);
  await expect(mail.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
  await calendar.goto("/calendar");
  await expect(
    calendar.getByText("Baubesprechung Hoffmann", { exact: true }).first(),
  ).toBeVisible();
  await chat.goto("/chat");
  const take = await startTake("phones", {
    mail: { page: mail, kind: "phone", label: "" },
    calendar: { page: calendar, kind: "phone", label: "" },
    chat: { page: chat, kind: "phone", label: "" },
  });
  const note = say(
    "Am Handy wie eine App – ohne App Store",
    "Like an app on your phone – no app store",
  );
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
        chat.getByRole("list", { name: ui("chat_messages") }).getByText("Passt, ich messe"),
      ).toBeVisible(),
    note: say(
      "Mit Benachrichtigungen – auf iPhone und Android",
      "With notifications – on iPhone and Android",
    ),
  });
  await take.save();
  await closeAll(mail, calendar, chat);
};
