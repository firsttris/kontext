import { describe, expect, it } from "vitest";
import type { EmailSummary } from "@/jmap/types";
import { patchListData } from "./queries";

const mail = (id: string) => ({ id, keywords: {} }) as EmailSummary;
const list = {
  pageParams: [0],
  pages: [{ emails: [mail("a"), mail("b")], position: 0, total: 2 }],
};

describe("patchListData", () => {
  it("changes or drops the given mails of a paged list", () => {
    const dropped = patchListData(list, ["a"], () => null);
    expect(dropped.pages[0]!.emails.map((email) => email.id)).toEqual(["b"]);
    const read = patchListData(list, ["b"], (email) => ({ ...email, keywords: { $seen: true } }));
    expect(read.pages[0]!.emails[1]!.keywords).toEqual({ $seen: true });
  });

  it("leaves other queries under the same key alone, like the last mails with a person", () => {
    const plain = [mail("a")];
    expect(patchListData(plain, ["a"], () => null)).toBe(plain);
    expect(patchListData(undefined, ["a"], () => null)).toBeUndefined();
  });
});
