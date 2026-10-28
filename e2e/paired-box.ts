import { spawn } from "node:child_process";
import { expect, type Page } from "@playwright/test";

/**
 * Jonas' phone line with a fake box (dev/fake-box.ts) paired to it, for the pictures and the film:
 * the Fritzbox login, Jonas as the one who rings, and the box on a control port of its own.
 */
export const pairBox = async (page: Page, controlPort: number) => {
  await page.goto("/settings?section=phone");
  const line = page.getByRole("region", { name: "Anmeldung an der Fritzbox" });
  await line.getByLabel("Benutzername").fill("kontext620");
  await line.getByLabel("Kennwort").fill("geheim");
  await line.getByRole("button", { name: "Speichern" }).click();
  const ring = page.getByRole("region", { name: "Wer klingelt" });
  await ring.getByLabel("Jonas Weber").check();
  await ring.getByRole("button", { name: "Speichern" }).click();
  const boxes = page.getByRole("region", { name: "Telefonbox" });
  await boxes.getByRole("button", { name: "Box koppeln" }).click();
  const code = (await boxes.getByText(/^Kopplungscode: /).textContent())!.replace(
    "Kopplungscode: ",
    "",
  );
  const control = `http://127.0.0.1:${controlPort}`;
  const box = spawn("bun", [
    "dev/fake-box.ts",
    "--url",
    "http://127.0.0.1:28090",
    "--code",
    code,
    "--control",
    String(controlPort),
  ]);
  await expect
    .poll(async () => (await fetch(`${control}/state`).catch(() => null))?.ok ?? false, {
      timeout: 20_000,
    })
    .toBe(true);
  const post = (path: string, body: unknown) =>
    fetch(`${control}${path}`, { method: "POST", body: JSON.stringify(body) });
  return {
    ring: async (from: string) =>
      ((await (await post("/ring", { from })).json()) as { call: string }).call,
    hangup: (call: string) => post("/hangup", { call }),
    stop: () => box.kill(),
  };
};
