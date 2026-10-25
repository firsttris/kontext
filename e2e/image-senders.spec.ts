import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type Page, test } from "@playwright/test";
import { address, jmapAs, login, unique } from "./helpers";

/** A picture on "the internet", counting who loads it. */
const pictureServer = async () => {
  let hits = 0;
  const server = createServer((_request, response) => {
    hits++;
    response.writeHead(200, { "content-type": "image/gif" });
    response.end(Buffer.from("R0lGODlhAQABAAAAACw=", "base64"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/pixel.gif`,
    hits: () => hits,
    close: () => server.close(),
  };
};

/** An HTML newsletter with a picture, straight into Max's inbox. */
const newsletter = async (subject: string, picture: string) => {
  const client = jmapAs("max");
  const session = await client.getSession();
  const accountId = Object.entries(session.accounts).find(
    ([, account]) => account.name === address("max"),
  )![0];
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  await client.call("Email/set", {
    accountId,
    create: {
      m: {
        mailboxIds: { [list.find((box) => box.role === "inbox")!.id]: true },
        from: [{ name: "Shop News", email: "news@shop.example" }],
        to: [{ email: address("max") }],
        subject,
        receivedAt: new Date().toISOString(),
        bodyValues: { h: { value: `<p>Neu im Shop</p><img src="${picture}" alt="Banner">` } },
        htmlBody: [{ partId: "h", type: "text/html" }],
      },
    },
  });
};

const open = async (page: Page, subject: string) => {
  await page.goto("/mail");
  await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
};

test.describe("Bilder je Absender", () => {
  test("„Immer von …“ lädt die Bilder dieses Absenders künftig sofort", async ({ page }) => {
    const pictures = await pictureServer();
    const first = unique("Herbstaktion");
    const second = unique("Winteraktion");
    await newsletter(first, pictures.url);
    await newsletter(second, pictures.url);
    await login(page, "max");

    await open(page, first);
    await expect(page.getByText("Bilder aus dem Internet sind blockiert.")).toBeVisible();
    expect(pictures.hits()).toBe(0);
    await page.getByRole("button", { name: "Immer von news@shop.example" }).click();
    await expect.poll(pictures.hits).toBeGreaterThan(0);

    const before = pictures.hits();
    await open(page, second);
    await expect(
      page.getByText("Bilder von news@shop.example werden immer geladen."),
    ).toBeVisible();
    await expect.poll(pictures.hits).toBeGreaterThan(before);

    // In the settings, and taken back there.
    await page.goto("/settings?section=security");
    const card = page.getByRole("region", { name: "Bilder aus dem Internet" });
    await expect(card.getByRole("list", { name: "Immer laden von" })).toContainText(
      "news@shop.example",
    );
    await card.getByRole("button", { name: "news@shop.example entfernen" }).click();
    await expect(card.getByRole("list", { name: "Immer laden von" })).toHaveCount(0);
    pictures.close();
  });
});
