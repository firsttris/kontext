import { readFileSync } from "node:fs";
import { type Browser, expect, type Page } from "@playwright/test";
import { say, ui } from "../language";
import { ADDRESS, closeAll, desktopOf, mailShown, READING } from "../screens";
import { startTake } from "../take";

/**
 * Schreibzeug in Kontext's frame, as its own pictures (docs/screenshots of firsttris/schreibzeug,
 * copied to video/schreibzeug/): the e2e stand-in (dev/fake-schreibzeug.ts) only says who is
 * signed in. Each request to it gets a page with the pictures; `show` picks one.
 */
const PICTURES = ["files", "comments", "spreadsheet", "presentation"] as const;
type Picture = (typeof PICTURES)[number];

const schreibzeugPage = () => {
  const images = PICTURES.map((name) => {
    const data = readFileSync(`video/schreibzeug/${name}.png`).toString("base64");
    return `<img data-name="${name}" src="data:image/png;base64,${data}">`;
  }).join("");
  return `<!doctype html><html><head><style>
body { margin: 0; background: white; }
img { display: none; width: 100%; height: auto; }
${PICTURES.map((name) => `body[data-show="${name}"] img[data-name="${name}"] { display: block; }`).join("\n")}
</style></head><body data-show="files">${images}</body></html>`;
};

const showSchreibzeug = (page: Page) => {
  const frame = page.frameLocator('iframe[src*="embedded=kontext"]');
  return (picture: Picture) =>
    frame.locator("body").evaluate((body, name) => {
      body.dataset.show = name;
    }, picture);
};

/** Documents: an attachment filed with a click, then Word, Excel and PowerPoint beside the mail. */
export const recordDocuments = async (browser: Browser) => {
  const page = await desktopOf(browser);
  const body = schreibzeugPage();
  await page.route(/:28097\//, (route) => route.fulfill({ contentType: "text/html", body }));
  const take = await startTake("documents", { app: { page, kind: "desktop", label: ADDRESS } });
  await page
    .getByRole("list", { name: ui("mail_inbox") })
    .getByText("Angebot Wartungsvertrag 2027")
    .click();
  await mailShown(page);
  const fileIt = say("Den Anhang mit einem Klick ablegen", "File the attachment with one click");
  const name = "Angebot-Wartung-2027.pdf";
  const saved = page.getByText(ui("documents_saved", { name }));
  await take.hold("app", 0.8, { focus: READING, note: fileIt });
  const file = page.getByRole("dialog", { name: ui("documents_save_title") });
  await take.click("app", page.getByRole("button", { name: ui("documents_save", { name }) }), 1.0, {
    until: () => expect(file).toBeVisible(),
    focus: null,
    note: fileIt,
  });
  await take.click("app", file.getByRole("button", { name: ui("documents_save_here") }), 1.0, {
    until: () => expect(saved).toBeVisible(),
    note: fileIt,
  });

  // The notice goes before Schreibzeug comes, so it does not lie over its pictures.
  await expect(saved).toHaveCount(0, { timeout: 15_000 });
  const show = showSchreibzeug(page);
  const rail = page.getByRole("navigation", { name: "Apps" }).first();
  await take.click("app", rail.getByRole("link", { name: ui("nav_documents") }), 1.3, {
    until: async () => {
      await expect(page).toHaveURL(/\/documents/);
      await page.waitForTimeout(800);
    },
    note: say(
      "Dokumente mit Schreibzeug, gleich daneben",
      "Documents with Schreibzeug, right alongside",
    ),
  });
  await show("comments");
  await take.hold("app", 2.0, {
    focus: { x: 640, y: 0, width: 800, height: 520 },
    note: say(
      "Word im Browser – mit Kommentaren der Kollegen",
      "Word in the browser – with colleagues’ comments",
    ),
  });
  await show("spreadsheet");
  await take.hold("app", 1.4, {
    focus: null,
    note: say("Excel mit Formeln", "Excel with formulas"),
  });
  await show("presentation");
  await take.hold("app", 1.6, {
    note: say(
      "PowerPoint – alles ohne Microsoft-Konto",
      "PowerPoint – all without a Microsoft account",
    ),
  });
  await take.save();
  await closeAll(page);
};
