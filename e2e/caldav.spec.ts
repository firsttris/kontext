import { expect, test } from "@playwright/test";
import { DEV_PASSWORD } from "../dev/config";
import { address, login, unique } from "./helpers";

const basic = (user: string) =>
  `Basic ${Buffer.from(`${address(user)}:${DEV_PASSWORD}`).toString("base64")}`;

test.describe("Aufgaben über CalDAV", () => {
  test("ein Client findet die Listen, legt an und hakt ab – Kontext zeigt es sofort", async ({
    page,
  }) => {
    const title = unique("Ölstand prüfen");
    await login(page);
    const me = await page.evaluate(
      async () =>
        (await (await fetch("/jmap/session")).json()).primaryAccounts[
          "urn:ietf:params:jmap:mail"
        ] as string,
    );
    const dav = page.context().request;
    const auth = { authorization: basic("jonas") };

    // Without sign-in nothing; the well-known address leads to /dav/.
    expect((await dav.fetch("/dav/", { method: "PROPFIND" })).status()).toBe(401);
    const wellKnown = await dav.fetch("/.well-known/caldav", { maxRedirects: 0 });
    expect(wellKnown.status()).toBe(301);
    expect(wellKnown.headers().location).toBe("/dav/");

    const home = await dav.fetch("/dav/tasks/", {
      method: "PROPFIND",
      headers: { ...auth, depth: "1" },
    });
    expect(home.status()).toBe(207);
    const listing = await home.text();
    expect(listing).toContain(`/dav/tasks/${me}/`);
    expect(listing).toContain("Meine Aufgaben (Kontext)");
    expect(listing).toContain("Aufgaben info@");

    await page.goto("/tasks");
    const vtodo = (status: string) =>
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VTODO",
        "UID:e2e-oel",
        `SUMMARY:${title}`,
        "DUE;VALUE=DATE:20991231",
        `STATUS:${status}`,
        "END:VTODO",
        "END:VCALENDAR",
      ].join("\r\n");
    const href = `/dav/tasks/${me}/${encodeURIComponent(title)}.ics`;
    const put = await dav.fetch(href, {
      method: "PUT",
      headers: { ...auth, "content-type": "text/calendar", "if-none-match": "*" },
      data: vtodo("NEEDS-ACTION"),
    });
    expect(put.status()).toBe(201);
    // Live in the open list, without reloading.
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();

    const done = await dav.fetch(href, {
      method: "PUT",
      headers: { ...auth, "content-type": "text/calendar", "if-match": put.headers().etag! },
      data: vtodo("COMPLETED"),
    });
    expect(done.status()).toBe(204);
    await expect(page.getByRole("list", { name: "Erledigt" })).toContainText(title);

    const got = await dav.fetch(href, { headers: auth });
    expect(await got.text()).toContain("STATUS:COMPLETED");
    expect((await dav.fetch(href, { method: "DELETE", headers: auth })).status()).toBe(204);
    await expect(page.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
  });

  test("die Einstellungen zeigen Adresse und Anleitung", async ({ page }) => {
    await login(page);
    await page.goto("/settings?section=sync");
    const card = page.getByRole("region", { name: "Aufgaben in Thunderbird und auf dem Handy" });
    await expect(card).toContainText("/dav/");
    await expect(card).toContainText("Thunderbird");
  });
});
