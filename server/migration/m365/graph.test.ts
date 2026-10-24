import { describe, expect, it } from "vitest";
import { createGraph } from "./graph";

const urls = { login: "https://login.test", graph: "https://graph.test/v1.0" };
const credentials = { tenantId: "t", clientId: "c", clientSecret: "s" };

/** A fetch that answers from a list and records the requests. */
const fakeFetch = (answers: Response[]) => {
  const requests: string[] = [];
  const fn = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return answers.shift() ?? new Response("{}", { status: 500 });
  }) as typeof fetch;
  return { fn, requests };
};

const token = () => Response.json({ access_token: "x", expires_in: 3600 });

describe("createGraph", () => {
  it("gets a token, follows the pages and keeps the delta link", async () => {
    const { fn, requests } = fakeFetch([
      token(),
      Response.json({ value: [1], "@odata.nextLink": "https://graph.test/v1.0/next" }),
      Response.json({ value: [2], "@odata.deltaLink": "https://graph.test/v1.0/delta" }),
    ]);
    const result = await createGraph(credentials, urls, fn).all<number>("/items");
    expect(result).toEqual({ items: [1, 2], deltaLink: "https://graph.test/v1.0/delta" });
    expect(requests).toEqual([
      "https://login.test/t/oauth2/v2.0/token",
      "https://graph.test/v1.0/items",
      "https://graph.test/v1.0/next",
    ]);
  });

  it("waits when Graph throttles and tries again", async () => {
    const { fn } = fakeFetch([
      token(),
      new Response("{}", { status: 429, headers: { "retry-after": "0" } }),
      Response.json({ value: [] }),
    ]);
    expect(await createGraph(credentials, urls, fn).get("/x")).toEqual({ value: [] });
  });

  it("says why Microsoft refuses the app", async () => {
    const { fn } = fakeFetch([
      Response.json(
        { error_description: "AADSTS7000215: Invalid client secret.\r\nTrace" },
        { status: 401 },
      ),
    ]);
    expect(await createGraph(credentials, urls, fn).authorize()).toEqual({
      ok: false,
      error: "AADSTS7000215: Invalid client secret.",
    });
  });
});
