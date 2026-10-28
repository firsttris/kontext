import { type Browser, expect } from "@playwright/test";
import { ADDRESS, closeAll, desktopOf, mailShown } from "../screens";
import { startTake } from "../take";

/** Tasks: a mail becomes a task with one key, the team's board, a card dragged along. */
export const recordTasks = async (browser: Browser, infoBoard: string) => {
  const page = await desktopOf(browser);
  const take = await startTake("tasks", { app: { page, kind: "desktop", label: ADDRESS } });
  await page.getByRole("link", { name: "info@" }).click();
  await page
    .getByRole("list", { name: "Posteingang" })
    .getByText("Wasserhahn tropft wieder")
    .click();
  await mailShown(page, "Claudia Sommer");
  await take.hold("app", 0.8, { note: "Aus der Mail wird eine Aufgabe" });
  const dialog = page.getByRole("dialog", { name: "Aufgabe aus dieser Mail" });
  await take.after(
    "app",
    async () => {
      await page.keyboard.press("t");
      await expect(dialog.getByLabel("Titel")).toHaveValue(/Wasserhahn/);
    },
    1.2,
    { focus: dialog, pad: 0, note: "Aus der Mail wird eine Aufgabe" },
  );
  await take.click("app", dialog.getByRole("button", { name: "Morgen" }), 0.8, {
    note: "Aus der Mail wird eine Aufgabe",
  });
  await take.click("app", dialog.getByRole("button", { name: "Aufgabe erstellen" }), 1.0, {
    until: () =>
      expect(page.getByRole("status").filter({ hasText: "Aufgabe angelegt." })).toBeVisible(),
    focus: null,
    note: "Aus der Mail wird eine Aufgabe",
  });

  await take.after(
    "app",
    async () => {
      await page.goto(`/tasks?board=${encodeURIComponent(infoBoard)}&mode=board`);
      await expect(page.getByText("Wasserhahn tropft wieder").first()).toBeVisible();
    },
    1.2,
    { note: "Das Board von info@ für alle" },
  );
  const card = page
    .getByRole("region", { name: "Offen" })
    .getByRole("link", { name: /Wasserhahn tropft wieder/ });
  await take.drag("app", card, page.getByRole("region", { name: "In Arbeit" }), 2.0, {
    note: "Ziehen – und alle sehen, wer dran ist",
  });
  await take.save();
  await closeAll(page);
};
