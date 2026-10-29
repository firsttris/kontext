import { type Browser, expect } from "@playwright/test";
import { say, ui, uiPattern } from "../language";
import { ADDRESS, closeAll, desktopOf, mailShown, READING } from "../screens";
import { startTake } from "../take";

/** Mail: the inbox, a mail with its PDF, the shared info@, a reply as info@, light to dark. */
export const recordMail = async (browser: Browser) => {
  const page = await desktopOf(browser);
  const dark = await desktopOf(browser, "jonas", "dark");
  const take = await startTake("mail", { app: { page, kind: "desktop", label: ADDRESS } });
  const inbox = page.getByRole("list", { name: ui("mail_inbox") });
  await expect(inbox.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
  await take.hold("app", 1.3, {
    note: say("Alle Postfächer in einer App", "Every mailbox in one app"),
  });

  await take.click("app", inbox.getByText("Angebot Wartungsvertrag 2027"), 2.4, {
    until: () => mailShown(page),
    focus: READING,
    note: say("Die PDF-Vorschau gleich in der Mail", "The PDF preview right in the email"),
  });

  await take.click("app", page.getByRole("link", { name: "info@" }), 1.0, {
    until: () => expect(inbox.getByText("Anfrage Wärmepumpe Neubau")).toBeVisible(),
    focus: null,
    note: say("info@ gehört dem ganzen Team", "info@ belongs to the whole team"),
  });
  await inbox.getByText("Anfrage Wärmepumpe Neubau").click();
  await mailShown(page);
  await take.click("app", page.getByRole("link", { name: uiPattern("mail_reply_to") }), 1.0, {
    until: () => expect(page.getByLabel(ui("mail_subject"))).toHaveValue(/Re:/),
    focus: { ...READING, height: 330 },
    note: say("Antwortet direkt als info@", "Replies straight from info@"),
  });
  const editor = page.getByRole("textbox", { name: ui("mail_body_placeholder") });
  await editor.click();
  await take.type(
    "app",
    editor,
    say("Gerne, wir kommen am Donnerstag vorbei!", "Sure, we’ll come by on Thursday!"),
    {
      note: say("Antwortet direkt als info@", "Replies straight from info@"),
    },
  );

  await dark
    .getByRole("list", { name: ui("mail_inbox") })
    .getByText("Angebot Wartungsvertrag 2027")
    .click();
  await mailShown(dark);
  await take.hold("app", 2.2, {
    from: dark,
    wipe: true,
    focus: null,
    note: say("Hell oder dunkel, wie es dir gefällt", "Light or dark, as you like it"),
  });
  await take.save();
  await closeAll(page, dark);
};
