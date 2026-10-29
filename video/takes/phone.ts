import { type Browser, expect } from "@playwright/test";
import { login } from "../../e2e/helpers";
import { pairBox } from "../../e2e/paired-box";
import { say, ui, uiPattern } from "../language";
import { ADDRESS, closeAll, desktopOf, mailShown } from "../screens";
import { startTake } from "../take";

/**
 * The box is paired before the take, not in it: through the German settings, which
 * e2e/paired-box.ts knows, in a page of its own; the box talks to the server, not to the page.
 */
const pairedBox = async (browser: Browser) => {
  const page = await (await browser.newContext({ locale: "de-DE" })).newPage();
  await login(page);
  const box = await pairBox(page, 28098);
  await closeAll(page);
  return box;
};

/** The phone: the Fritzbox rings in Kontext, with who calls and what was last; picked up. */
export const recordPhone = async (browser: Browser) => {
  const box = await pairedBox(browser);
  const page = await desktopOf(browser);
  try {
    const take = await startTake("phone", { app: { page, kind: "desktop", label: ADDRESS } });
    await page.goto("/mail");
    await page
      .getByRole("list", { name: ui("mail_inbox") })
      .getByText("Heizung macht Geräusche")
      .click();
    await mailShown(page, "Claudia Sommer");
    await take.hold("app", 0.9);
    const card = page.getByRole("dialog", {
      name: ui("phone_incoming", { name: "Petra Keller" }),
    });
    const call = await box.ring("07223 81234");
    await take.after("app", () => expect(card).toContainText("Keller Elektro GmbH"), 2.6, {
      focus: card,
      pad: 30,
      note: say(
        "Petra Keller ruft an – mit Firma und letzter Mail",
        "Petra Keller calls – with her company and last email",
      ),
    });
    const panel = page.getByRole("region", { name: uiPattern("phone_panel") });
    await take.click("app", card.getByRole("button", { name: ui("phone_answer") }), 1.8, {
      until: () => expect(panel.getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 }),
      focus: null,
      note: say(
        "Annehmen am Rechner, die Fritzbox bleibt",
        "Answer at the computer, keep the Fritzbox",
      ),
    });
    await take.save();
    await box.hangup(call);
  } finally {
    box.stop();
    await closeAll(page);
  }
};
