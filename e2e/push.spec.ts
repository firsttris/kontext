import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, type Page, test } from "@playwright/test";
import { browserKeys, decryptPayload } from "../server/push/receive";
import { address, login, unique } from "./helpers";
import { deliverMail } from "./protocols";

type Received = {
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};

/** A stand-in for a browser's push service: keeps what the server posts. */
const fakePushService = async () => {
  const received: Received[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      received.push({
        path: request.url ?? "",
        headers: request.headers,
        body: Buffer.concat(chunks),
      });
      response.writeHead(201).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { received, url: `http://127.0.0.1:${port}`, close: () => server.close() };
};

const personalId = (page: Page) =>
  page.evaluate(
    async () =>
      (await (await fetch("/jmap/session")).json()).primaryAccounts[
        "urn:ietf:params:jmap:mail"
      ] as string,
  );

test.describe("Benachrichtigungen bei geschlossener App (Web Push)", () => {
  test("Direktnachricht und neue Mail kommen verschlüsselt beim Push-Dienst an", async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    const service = await fakePushService();
    const keys = await browserKeys();
    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    const endpoint = `${service.url}/max-${Date.now()}`;
    const subscribed = await max.request.post("/api/push/subscriptions", {
      data: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    });
    expect(subscribed.status()).toBe(201);
    const pushes = async () =>
      Promise.all(
        service.received
          .filter((push) => endpoint.endsWith(push.path))
          .map(async (push) => JSON.parse(await decryptPayload(new Uint8Array(push.body), keys))),
      );

    // A direct message from Jonas.
    await login(page);
    const maxId = await personalId(max);
    const text = unique("Kommst du morgen früher?");
    const direct = await page.request.post("/api/chat/direct", { data: { members: [maxId] } });
    const { channel } = await direct.json();
    await page.request.post(`/api/chat/channels/${channel.id}/messages`, { data: { text } });
    await expect.poll(pushes).toContainEqual({
      title: "Jonas Weber",
      body: text,
      url: expect.stringContaining(`/chat?channel=${channel.id}&message=`),
      tag: `chat-${channel.id}`,
    });
    const first = service.received.find((push) => endpoint.endsWith(push.path))!;
    expect(first.headers["content-encoding"]).toBe("aes128gcm");
    expect(String(first.headers.authorization)).toMatch(/^vapid t=.+, k=.+$/);

    // A new mail in Max's inbox (the server listens to Stalwart for him now).
    await page.waitForTimeout(2000);
    const subject = unique("Rückfrage Lieferung");
    await deliverMail({
      from: "petra@keller-elektro.test",
      fromName: "Petra Keller",
      to: address("max"),
      subject,
      body: "Kommt die Lieferung am Freitag?",
    });
    await expect
      .poll(pushes, { timeout: 20_000 })
      .toContainEqual(
        expect.objectContaining({ title: "Neue Mail von Petra Keller", body: subject }),
      );

    // Switched off on that device: nothing more goes there.
    await max.request.delete("/api/push/subscriptions", { data: { endpoint } });
    const before = service.received.length;
    await page.request.post(`/api/chat/channels/${channel.id}/messages`, {
      data: { text: "Noch da?" },
    });
    await page.waitForTimeout(1500);
    expect(service.received.length).toBe(before);
    service.close();
  });

  test("nimmt keine Adresse an, die kein Push-Dienst ist, wenn das nicht erlaubt ist", async ({
    page,
  }) => {
    // The e2e server allows any address (PUSH_ANY_ENDPOINT); here only that a bad one fails.
    await login(page);
    const response = await page.request.post("/api/push/subscriptions", {
      data: { endpoint: "ftp://intern/x", keys: { p256dh: "B".repeat(87), auth: "A".repeat(22) } },
    });
    expect(response.status()).toBe(400);
  });
});
