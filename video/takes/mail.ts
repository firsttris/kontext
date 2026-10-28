import { type Browser, expect } from "@playwright/test";
import { ADDRESS, closeAll, desktopOf, mailShown, READING } from "../screens";
import { startTake } from "../take";

/** Mail: the inbox, a mail with its PDF, the shared info@, a reply as info@, light to dark. */
export const recordMail = async (browser: Browser) => {
  const page = await desktopOf(browser);
  const dark = await desktopOf(browser, "jonas", "dark");
  const take = await startTake("mail", { app: { page, kind: "desktop", label: ADDRESS } });
  const inbox = page.getByRole("list", { name: "Posteingang" });
  await expect(inbox.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
  await take.hold("app", 1.3, { note: "Alle Postfächer in einer App" });

  await take.click("app", inbox.getByText("Angebot Wartungsvertrag 2027"), 2.4, {
    until: () => mailShown(page),
    focus: READING,
    note: "Die PDF-Vorschau gleich in der Mail",
  });

  await take.click("app", page.getByRole("link", { name: "info@" }), 1.0, {
    until: () => expect(inbox.getByText("Anfrage Wärmepumpe Neubau")).toBeVisible(),
    focus: null,
    note: "info@ gehört dem ganzen Team",
  });
  await inbox.getByText("Anfrage Wärmepumpe Neubau").click();
  await mailShown(page);
  await take.click("app", page.getByRole("link", { name: /^Antworten an / }), 1.0, {
    until: () => expect(page.getByLabel("Betreff")).toHaveValue(/Re:/),
    focus: { ...READING, height: 330 },
    note: "Antwortet direkt als info@",
  });
  const editor = page.getByRole("textbox", { name: "Ihre Nachricht …" });
  await editor.click();
  await take.type("app", editor, "Gerne, wir kommen am Donnerstag vorbei!", {
    note: "Antwortet direkt als info@",
  });

  await dark
    .getByRole("list", { name: "Posteingang" })
    .getByText("Angebot Wartungsvertrag 2027")
    .click();
  await mailShown(dark);
  await take.hold("app", 2.2, {
    from: dark,
    wipe: true,
    focus: null,
    note: "Hell oder dunkel, wie es dir gefällt",
  });
  await take.save();
  await closeAll(page, dark);
};
