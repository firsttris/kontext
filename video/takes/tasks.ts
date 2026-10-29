import { type Browser, expect } from "@playwright/test";
import { say, ui } from "../language";
import { ADDRESS, closeAll, desktopOf, mailShown } from "../screens";
import { startTake } from "../take";

/** Tasks: a mail becomes a task with one key, the team's board, a card dragged along. */
export const recordTasks = async (browser: Browser, infoBoard: string) => {
  const page = await desktopOf(browser);
  const take = await startTake("tasks", { app: { page, kind: "desktop", label: ADDRESS } });
  await page.getByRole("link", { name: "info@" }).click();
  await page
    .getByRole("list", { name: ui("mail_inbox") })
    .getByText("Wasserhahn tropft wieder")
    .click();
  await mailShown(page, "Claudia Sommer");
  const note = say("Aus der Mail wird eine Aufgabe", "The email becomes a task");
  await take.hold("app", 0.8, { note });
  const dialog = page.getByRole("dialog", { name: ui("tasks_from_mail_title") });
  await take.after(
    "app",
    async () => {
      await page.keyboard.press("t");
      await expect(dialog.getByLabel(ui("tasks_title_field"))).toHaveValue(/Wasserhahn/);
    },
    1.2,
    { focus: dialog, pad: 0, note },
  );
  await take.click("app", dialog.getByRole("button", { name: ui("tasks_quick_tomorrow") }), 0.8, {
    note,
  });
  await take.click("app", dialog.getByRole("button", { name: ui("tasks_create") }), 1.0, {
    until: () =>
      expect(page.getByRole("status").filter({ hasText: ui("tasks_created") })).toBeVisible(),
    focus: null,
    note,
  });

  await take.after(
    "app",
    async () => {
      await page.goto(`/tasks?board=${encodeURIComponent(infoBoard)}&mode=board`);
      await expect(page.getByText("Wasserhahn tropft wieder").first()).toBeVisible();
    },
    1.2,
    { note: say("Das Board von info@ für alle", "info@’s board, for everyone") },
  );
  const card = page
    .getByRole("region", { name: ui("tasks_status_open") })
    .getByRole("link", { name: /Wasserhahn tropft wieder/ });
  await take.drag("app", card, page.getByRole("region", { name: ui("tasks_status_doing") }), 2.0, {
    note: say("Ziehen – und alle sehen, wer dran ist", "Drag it – and everyone sees who’s on it"),
  });
  await take.save();
  await closeAll(page);
};
