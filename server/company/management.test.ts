import { describe, expect, it } from "vitest";
import { createManagement, type Invocation } from "./management";

describe("oauthClients", () => {
  it("reads the clients with their scopes", async () => {
    const calls: Invocation[][] = [];
    const management = createManagement(async (methodCalls) => {
      calls.push(methodCalls);
      return [
        ["x:OAuthClient/get", { list: [{ clientId: "kontext", scopes: { full: true } }] }, "0"],
      ];
    });
    expect(await management.oauthClients()).toEqual([
      { clientId: "kontext", scopes: { full: true } },
    ]);
    expect(calls[0]![0]).toEqual([
      "x:OAuthClient/get",
      { ids: null, properties: ["clientId", "scopes"] },
      "0",
    ]);
  });

  it("knows nothing when the key may not read them or Stalwart is away", async () => {
    const refused = createManagement(async () => {
      throw new Error("forbidden");
    });
    expect(await refused.oauthClients()).toBeNull();
  });
});
