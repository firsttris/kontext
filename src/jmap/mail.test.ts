import { describe, expect, it } from "vitest";
import { type JmapClient, jmapError } from "./client";
import { queryEmails } from "./mail";

type Call = [string, Record<string, unknown>, string];

/** A Stalwart that finds one mail and answers SearchSnippet/get as `snippet` says. */
const fakeStalwart = (snippet: "ok" | "error") => {
  const sent: Call[][] = [];
  const client = {
    request: async (calls: Call[]) => {
      sent.push(calls);
      // Like client.ts: a method-level error in the response throws.
      if (snippet === "error" && calls.some(([name]) => name === "SearchSnippet/get"))
        throw jmapError("Too many search terms in one query", "requestTooLarge");
      return calls.map(([name, , id]): Call => {
        if (name === "Email/query") return [name, { ids: ["m1"], total: 1 }, id];
        if (name === "Email/get") return [name, { list: [{ id: "m1", subject: "Angebot" }] }, id];
        return [name, { list: [{ emailId: "m1", subject: null, preview: null }] }, id];
      });
    },
  } as unknown as JmapClient;
  return { client, sent };
};

describe("queryEmails in a search", () => {
  it("still finds the mails when Stalwart answers the snippet call with an error", async () => {
    const { client } = fakeStalwart("error");
    const page = await queryEmails(client, "a", { search: { text: "zebrafink" } }, 0);
    expect(page.emails.map((email) => email.id)).toEqual(["m1"]);
    expect(page.total).toBe(1);
  });

  it("loads Cc and Bcc, which the text filter searches too", async () => {
    const { client, sent } = fakeStalwart("ok");
    await queryEmails(client, "a", { search: { text: "kranich" } }, 0);
    const get = sent[0]!.find(([name]) => name === "Email/get")!;
    expect(get[1].properties).toEqual(expect.arrayContaining(["cc", "bcc"]));
  });
});
