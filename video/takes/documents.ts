import { type Browser, expect } from "@playwright/test";
import { ADDRESS, closeAll, desktopOf, mailShown, READING } from "../screens";
import { startTake } from "../take";

/** Documents: an attachment filed in Documents with a click, and attached again from there. */
export const recordDocuments = async (browser: Browser) => {
  const page = await desktopOf(browser);
  const take = await startTake("documents", { app: { page, kind: "desktop", label: ADDRESS } });
  await page
    .getByRole("list", { name: "Posteingang" })
    .getByText("Angebot Wartungsvertrag 2027")
    .click();
  await mailShown(page);
  await take.hold("app", 0.8, { focus: READING, note: "Den Anhang mit einem Klick ablegen" });
  const file = page.getByRole("dialog", { name: "In Dokumente ablegen" });
  await take.click(
    "app",
    page.getByRole("button", { name: "„Angebot-Wartung-2027.pdf“ in Dokumente ablegen" }),
    1.1,
    {
      until: () => expect(file).toBeVisible(),
      focus: null,
      note: "Den Anhang mit einem Klick ablegen",
    },
  );
  await take.click("app", file.getByRole("button", { name: "Hier ablegen" }), 1.2, {
    until: () =>
      expect(page.getByText("„Angebot-Wartung-2027.pdf“ liegt jetzt in Dokumente.")).toBeVisible(),
    note: "Den Anhang mit einem Klick ablegen",
  });
  await take.after("app", () => page.keyboard.press("c"), 0.6, {
    note: "… und aus Dokumente wieder anhängen",
  });
  const pick = page.getByRole("dialog", { name: "Aus Dokumente anhängen" });
  await take.click("app", page.getByRole("button", { name: "Aus Dokumente anhängen" }), 1.1, {
    until: () => expect(pick).toBeVisible(),
    note: "… und aus Dokumente wieder anhängen",
  });
  await take.click("app", pick.getByRole("button", { name: "Angebot-Wartung-2027.pdf" }), 1.8, {
    until: () =>
      expect(
        page.getByRole("list", { name: "Anhänge" }).getByText("Angebot-Wartung-2027.pdf"),
      ).toBeVisible(),
    note: "Word, Excel und PDF – gemeinsam im Browser bearbeiten",
  });
  await take.save();
  await closeAll(page);
};
