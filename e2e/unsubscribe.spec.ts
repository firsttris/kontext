import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { address, login, unique } from "./helpers";
import { deliverMail } from "./protocols";

/** A certificate of its own making for 127.0.0.1: one-click unsubscribe is https only. */
const certificate = () => {
  const dir = mkdtempSync(join(tmpdir(), "kontext-list-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
    ],
    { stdio: "ignore" },
  );
  return { key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) };
};

/** The newsletter's server: keeps what is posted to it. */
const listServer = async () => {
  const posts: { path: string; body: string }[] = [];
  const server = createServer(certificate(), (request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      posts.push({ path: request.url ?? "", body });
      response.writeHead(200).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { posts, url: `https://127.0.0.1:${port}`, close: () => server.close() };
};

test.describe("Newsletter abbestellen", () => {
  test("mit einem Klick, danach gelöscht", async ({ page }) => {
    const list = await listServer();
    const subject = unique("Wärmepumpen-News Oktober");
    await deliverMail({
      from: "news@heizungsbau.example",
      fromName: "Heizungsbau News",
      to: address("sandra"),
      subject,
      body: "Die Neuheiten des Monats.",
      headers: [
        `List-Unsubscribe: <${list.url}/off?u=sandra>, <mailto:off@heizungsbau.example>`,
        "List-Unsubscribe-Post: List-Unsubscribe=One-Click",
      ],
    });
    await login(page, "sandra");
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await page.getByRole("button", { name: "Abbestellen" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Newsletter von Heizungsbau News abbestellen?",
    });
    await expect(dialog).toContainText("ohne Umweg über eine Webseite");
    await dialog.getByLabel("Diese Mail danach löschen").check();
    await dialog.getByRole("button", { name: "Abbestellen" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Bei Heizungsbau News abgemeldet." }),
    ).toBeVisible();
    expect(list.posts).toEqual([{ path: "/off?u=sandra", body: "List-Unsubscribe=One-Click" }]);
    await expect(page.getByRole("list", { name: "Posteingang" }).getByText(subject)).toHaveCount(0);
    list.close();
  });

  test("per Mail an die Liste; die Mail merkt es sich", async ({ page }) => {
    const subject = unique("Angebote der Woche");
    await deliverMail({
      from: "angebote@grosshandel.example",
      fromName: "Großhandel Angebote",
      to: address("sandra"),
      subject,
      body: "Diese Woche im Angebot.",
      headers: [`List-Unsubscribe: <mailto:${address("max")}?subject=Abmelden%20Sandra>`],
    });
    await login(page, "sandra");
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await page.getByRole("button", { name: "Abbestellen" }).click();
    const dialog = page.getByRole("dialog", { name: /abbestellen\?$/ });
    await expect(dialog).toContainText(`Abmelde-Mail an ${address("max")}`);
    await dialog.getByRole("button", { name: "Abbestellen" }).click();
    await expect(page.getByText("Abbestellt", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Gesendet", exact: true }).click();
    await expect(page.getByRole("list", { name: "Gesendet" })).toContainText("Abmelden Sandra");
  });
});
