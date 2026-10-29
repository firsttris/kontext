import { describe, expect, it } from "vitest";
import type { JmapClient } from "./client";
import { importEmlFiles } from "./eml-import";

/** A Stalwart that takes every upload but "kaputt", and refuses to import the blob "b-leer". */
const fakeStalwart = () => {
  const imports: Record<string, unknown>[] = [];
  const client = {
    upload: async (_accountId: string, data: Blob) => {
      const text = await data.text();
      if (text === "kaputt") throw new Error("Hochladen: 413");
      return { blobId: `b-${text}` };
    },
    call: async (method: string, args: { emails: Record<string, { blobId: string }> }) => {
      if (method !== "Email/import") throw new Error(`unexpected ${method}`);
      imports.push(args);
      const entries = Object.entries(args.emails);
      return {
        created: Object.fromEntries(
          entries.filter(([, e]) => e.blobId !== "b-leer").map(([key]) => [key, { id: key }]),
        ),
        notCreated: Object.fromEntries(
          entries
            .filter(([, e]) => e.blobId === "b-leer")
            .map(([key]) => [key, { type: "invalidEmail", description: "Kein RFC 5322" }]),
        ),
      };
    },
  } as unknown as JmapClient;
  return { client, imports };
};

const eml = (name: string, text: string, receivedAt?: string) => ({
  name,
  data: new Blob([text]),
  receivedAt,
});

describe("importEmlFiles", () => {
  it("imports into the folder, read, with the received time when known", async () => {
    const { client, imports } = fakeStalwart();
    const outcome = await importEmlFiles(client, "acc", "box", [
      eml("a.eml", "a", "2003-07-01T08:52:37Z"),
      eml("b.eml", "b"),
    ]);
    expect(outcome).toEqual({ imported: 2, failed: [] });
    expect(imports[0]).toEqual({
      accountId: "acc",
      emails: {
        e0: {
          blobId: "b-a",
          mailboxIds: { box: true },
          keywords: { $seen: true },
          receivedAt: "2003-07-01T08:52:37Z",
        },
        e1: { blobId: "b-b", mailboxIds: { box: true }, keywords: { $seen: true } },
      },
    });
  });

  it("names the files that failed to upload or import, with the reason", async () => {
    const { client } = fakeStalwart();
    const outcome = await importEmlFiles(client, "acc", "box", [
      eml("gut.eml", "gut"),
      eml("gross.eml", "kaputt"),
      eml("leer.eml", "leer"),
    ]);
    expect(outcome).toEqual({
      imported: 1,
      failed: [
        { name: "gross.eml", reason: "Hochladen: 413" },
        { name: "leer.eml", reason: "Kein RFC 5322" },
      ],
    });
  });
});
