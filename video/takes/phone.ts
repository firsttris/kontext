import { type Browser, expect } from "@playwright/test";
import { pairBox } from "../../e2e/paired-box";
import { ADDRESS, closeAll, desktopOf, mailShown } from "../screens";
import { startTake } from "../take";

/** The phone: the Fritzbox rings in Kontext, with who calls and what was last; picked up. */
export const recordPhone = async (browser: Browser) => {
  const page = await desktopOf(browser);
  const box = await pairBox(page, 28098);
  try {
    const take = await startTake("phone", { app: { page, kind: "desktop", label: ADDRESS } });
    await page.goto("/mail");
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Heizung macht Geräusche")
      .click();
    await mailShown(page, "Claudia Sommer");
    await take.hold("app", 0.9);
    const card = page.getByRole("dialog", { name: "Anruf von Petra Keller" });
    const call = await box.ring("07223 81234");
    await take.after("app", () => expect(card).toContainText("Keller Elektro GmbH"), 2.6, {
      focus: card,
      pad: 30,
      note: "Petra Keller ruft an – mit Firma und letzter Mail",
    });
    const panel = page.getByRole("region", { name: /^Telefonat:/ });
    await take.click("app", card.getByRole("button", { name: "Annehmen" }), 1.8, {
      until: () => expect(panel.getByRole("status")).toHaveText(/^\d+:\d\d$/, { timeout: 15_000 }),
      focus: null,
      note: "Annehmen am Rechner, die Fritzbox bleibt",
    });
    await take.save();
    await box.hangup(call);
  } finally {
    box.stop();
    await closeAll(page);
  }
};
