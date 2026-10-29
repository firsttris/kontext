import { expect, type Page, test } from "@playwright/test";
import { browserKeys, decryptPayload } from "../server/push/receive";
import { fakePushService } from "./fake-push";
import { address, jmapAs, login, personalAccountId, unique } from "./helpers";
import { deliverMail } from "./protocols";

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

  test("Erinnerung an einen Termin kommt als Push, auch bei geschlossener App", async ({
    browser,
  }) => {
    test.setTimeout(150_000);
    const service = await fakePushService();
    const keys = await browserKeys();
    const sandra = await (await browser.newContext()).newPage();
    await login(sandra, "sandra");
    const endpoint = `${service.url}/sandra-${Date.now()}`;
    await sandra.request.post("/api/push/subscriptions", {
      data: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    });
    await sandra.close();
    const pushes = async () =>
      Promise.all(
        service.received
          .filter((push) => endpoint.endsWith(push.path))
          .map(async (push) => JSON.parse(await decryptPayload(new Uint8Array(push.body), keys))),
      );

    // An appointment in a minute and a half that reminds a minute before, made behind the
    // UI's back: Stalwart tells the server, the server tells Sandra's device.
    const using = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];
    const client = jmapAs("sandra");
    const accountId = await personalAccountId("sandra");
    const { list } = await client.call<{ list: { id: string; isDefault: boolean }[] }>(
      "Calendar/get",
      { accountId },
      using,
    );
    const calendar = list.find((c) => c.isDefault) ?? list[0]!;
    const start = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Berlin",
      dateStyle: "short",
      timeStyle: "medium",
    })
      .format(new Date(Date.now() + 90_000))
      .replace(" ", "T");
    const title = unique("Heizungscheck");
    const { created } = await client.call<{ created: Record<string, { id: string }> }>(
      "CalendarEvent/set",
      {
        accountId,
        create: {
          e: {
            calendarIds: { [calendar.id]: true },
            title,
            start,
            timeZone: "Europe/Berlin",
            duration: "PT1H",
            locations: { l: { "@type": "Location", name: "Werkstatt" } },
            alerts: {
              a: {
                "@type": "Alert",
                trigger: { "@type": "OffsetTrigger", offset: "-PT1M", relativeTo: "start" },
                action: "display",
              },
            },
          },
        },
      },
      using,
    );
    const id = created.e!.id;
    await expect.poll(pushes, { timeout: 120_000, intervals: [2000] }).toContainEqual({
      title: `Erinnerung: ${title}`,
      body: expect.stringMatching(/^\w{2}\., \d{2}\.\d{2}\., \d{2}:\d{2} · Werkstatt$/),
      url: `/calendar?date=${start.slice(0, 10)}&event=${id}&account=${accountId}`,
      tag: `reminder-${accountId}/${id}`,
    });
    await client.call("CalendarEvent/set", { accountId, destroy: [id] }, using);
    service.close();
  });

  test("meldet keine Mails aus einem abgewählten gemeinsamen Postfach", async ({ browser }) => {
    test.setTimeout(60_000);
    const service = await fakePushService();
    const keys = await browserKeys();
    const anna = await (await browser.newContext()).newPage();
    await login(anna, "anna");
    const endpoint = `${service.url}/anna-${Date.now()}`;
    await anna.request.post("/api/push/subscriptions", {
      data: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    });
    const info = await anna.evaluate(async () => {
      const session = await (await fetch("/jmap/session")).json();
      return Object.entries(session.accounts).find(([, a]) =>
        (a as { name: string }).name.startsWith("info@"),
      )![0];
    });
    const off = await anna.request.put(`/api/push/mailboxes/${info}`, { data: { on: false } });
    expect(await off.json()).toEqual({ off: [info] });
    const titles = async () =>
      Promise.all(
        service.received
          .filter((push) => endpoint.endsWith(push.path))
          .map(
            async (push) => JSON.parse(await decryptPayload(new Uint8Array(push.body), keys)).body,
          ),
      );

    await anna.waitForTimeout(2000);
    const shared = unique("Anfrage an info@");
    const own = unique("Für Anna persönlich");
    await deliverMail({
      from: "kunde@example.test",
      fromName: "Kunde",
      to: address("info"),
      subject: shared,
      body: "Hallo",
    });
    await deliverMail({
      from: "kunde@example.test",
      fromName: "Kunde",
      to: address("anna"),
      subject: own,
      body: "Hallo",
    });
    await expect.poll(titles, { timeout: 20_000 }).toContain(own);
    expect(await titles()).not.toContain(shared);
    await anna.request.put(`/api/push/mailboxes/${info}`, { data: { on: true } });
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
