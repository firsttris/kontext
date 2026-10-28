import { readFileSync } from "node:fs";
import { type Browser, expect, type Page } from "@playwright/test";
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
    .getByRole("list", { name: "Posteingang" })
    .getByText("Angebot Wartungsvertrag 2027")
    .click();
  await mailShown(page);
  await take.hold("app", 0.8, { focus: READING, note: "Den Anhang mit einem Klick ablegen" });
  const file = page.getByRole("dialog", { name: "In Dokumente ablegen" });
  await take.click(
    "app",
    page.getByRole("button", { name: "„Angebot-Wartung-2027.pdf“ in Dokumente ablegen" }),
    1.0,
    {
      until: () => expect(file).toBeVisible(),
      focus: null,
      note: "Den Anhang mit einem Klick ablegen",
    },
  );
  await take.click("app", file.getByRole("button", { name: "Hier ablegen" }), 1.0, {
    until: () =>
      expect(page.getByText("„Angebot-Wartung-2027.pdf“ liegt jetzt in Dokumente.")).toBeVisible(),
    note: "Den Anhang mit einem Klick ablegen",
  });

  // The notice goes before Schreibzeug comes, so it does not lie over its pictures.
  await expect(page.getByText("„Angebot-Wartung-2027.pdf“ liegt jetzt in Dokumente.")).toHaveCount(
    0,
    {
      timeout: 15_000,
    },
  );
  const show = showSchreibzeug(page);
  const rail = page.getByRole("navigation", { name: "Apps" }).first();
  await take.click("app", rail.getByRole("link", { name: "Dokumente" }), 1.3, {
    until: async () => {
      await expect(page).toHaveURL(/\/documents/);
      await page.waitForTimeout(800);
    },
    note: "Dokumente mit Schreibzeug, gleich daneben",
  });
  await show("comments");
  await take.hold("app", 2.0, {
    focus: { x: 640, y: 0, width: 800, height: 520 },
    note: "Word im Browser – mit Kommentaren der Kollegen",
  });
  await show("spreadsheet");
  await take.hold("app", 1.4, { focus: null, note: "Excel mit Formeln" });
  await show("presentation");
  await take.hold("app", 1.6, { note: "PowerPoint – alles ohne Microsoft-Konto" });
  await take.save();
  await closeAll(page);
};
