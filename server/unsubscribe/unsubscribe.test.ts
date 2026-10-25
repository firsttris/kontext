// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../env";
import type { SessionInfo } from "../session-info";
import { isPrivateAddress } from "./private-address";
import { createUnsubscribeRoutes } from "./routes";
import { unsubscribeWay } from "./unsubscribe";

describe("which way to unsubscribe", () => {
  it("one click where the sender allows it, else by mail, else on the page", () => {
    const urls = ["<mailto:off@list.test?subject=Abmelden>", "https://list.test/off?u=1"].map(
      (url) => url.replace(/^<|>$/g, ""),
    );
    expect(unsubscribeWay(urls, "List-Unsubscribe=One-Click")).toEqual({
      kind: "one-click",
      url: "https://list.test/off?u=1",
    });
    expect(unsubscribeWay(urls, null)).toEqual({
      kind: "mail",
      to: "off@list.test",
      subject: "Abmelden",
      body: "unsubscribe",
    });
    expect(unsubscribeWay(["https://list.test/off"], null)).toEqual({
      kind: "web",
      url: "https://list.test/off",
    });
    expect(unsubscribeWay(["http://list.test/off"], "List-Unsubscribe=One-Click")?.kind).toBe(
      "web",
    );
    expect(unsubscribeWay(null, null)).toBeNull();
    expect(unsubscribeWay(["javascript:alert(1)"], null)).toBeNull();
  });

  it("knows addresses inside a network", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.178.1",
      "172.20.0.1",
      "169.254.1.1",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
      "nonsense",
    ]) {
      expect(isPrivateAddress(address), address).toBe(true);
    }
    for (const address of ["93.184.216.34", "2a00:1450:4001::200e", "172.32.0.1"]) {
      expect(isPrivateAddress(address), address).toBe(false);
    }
  });
});

const info: SessionInfo = {
  sessionId: "s",
  name: "Jonas",
  accounts: [{ id: "jonas", isPersonal: true, isReadOnly: false }],
};

/** Stalwart answers with the mail's headers; the list's server answers the post. */
const setup = (headers: Record<string, unknown>, address = "93.184.216.34") => {
  const posted: { url: string; body: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      if (href.endsWith("/jmap/session")) return Response.json({ apiUrl: "https://x/jmap/" });
      if (href.startsWith("http://stalwart")) {
        return Response.json({ methodResponses: [["Email/get", { list: [headers] }, "g"]] });
      }
      posted.push({ url: href, body: String(init?.body) });
      return new Response(null, { status: 200 });
    }),
  );
  const app = createUnsubscribeRoutes({
    env: { STALWART_URL: "http://stalwart", UNSUBSCRIBE_ANY_TARGET: false } as Env,
    grants: { accessToken: async () => "token" },
    infoOf: async () => info,
    resolve: async () => [address],
  });
  const call = (body: unknown) =>
    app.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return { posted, call };
};

afterEach(() => vi.unstubAllGlobals());

describe("/api/unsubscribe", () => {
  const oneClick = {
    "header:List-Unsubscribe:asURLs": ["https://list.test/off?u=1"],
    "header:List-Unsubscribe-Post:asText": "List-Unsubscribe=One-Click",
  };

  it("posts the one click to the address in the mail", async () => {
    const { posted, call } = setup(oneClick);
    const response = await call({ accountId: "jonas", emailId: "m1" });
    expect(response.status).toBe(200);
    expect(posted).toEqual([
      { url: "https://list.test/off?u=1", body: "List-Unsubscribe=One-Click" },
    ]);
  });

  it("not into a network, not for a mailbox one has not, not without one click", async () => {
    expect(
      (await setup(oneClick, "192.168.1.10").call({ accountId: "jonas", emailId: "m1" })).status,
    ).toBe(400);
    expect((await setup(oneClick).call({ accountId: "fremd", emailId: "m1" })).status).toBe(404);
    const web = { "header:List-Unsubscribe:asURLs": ["https://list.test/off"] };
    expect((await setup(web).call({ accountId: "jonas", emailId: "m1" })).status).toBe(400);
  });
});
