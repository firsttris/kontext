/** Pictures "from the internet" for the e2e tests: a local server and a newsletter showing one. */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { address, jmapAs, personalAccountId } from "./helpers";

/** A picture on "the internet", counting who loads it. */
export const pictureServer = async () => {
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
export const newsletter = async (subject: string, picture: string): Promise<string> => {
  const client = jmapAs("max");
  const session = await client.getSession();
  const accountId = Object.entries(session.accounts).find(
    ([, account]) => account.name === address("max"),
  )![0];
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const { created } = await client.call<{ created: Record<string, { id: string }> }>("Email/set", {
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
  return created.m!.id;
};

/** Removes a mail `newsletter` put in. */
export const removeNewsletter = async (id: string) => {
  const client = jmapAs("max");
  const accountId = await personalAccountId("max");
  await client.call("Email/set", { accountId, destroy: [id] });
};
