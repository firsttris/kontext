import { describe, expect, it } from "vitest";
import { folderOrder, imapTarget, keywordsOf } from "./imap-folders";

const folder = (path: string, specialUse?: string, flags: string[] = []) => ({
  path,
  delimiter: "/",
  specialUse,
  flags,
});

describe("imapTarget", () => {
  it("maps Gmail's folders by their special use, in any language", () => {
    expect(imapTarget(folder("INBOX", "\\Inbox"))).toEqual({ role: "inbox", path: [] });
    expect(imapTarget(folder("[Google Mail]/Gesendet", "\\Sent"))).toEqual({
      role: "sent",
      path: [],
    });
    expect(imapTarget(folder("[Gmail]/Drafts", "\\Drafts"))).toEqual({ role: "drafts", path: [] });
  });

  it("leaves out views, spam, trash and containers", () => {
    for (const use of ["\\All", "\\Important", "\\Flagged", "\\Junk", "\\Trash"]) {
      expect(imapTarget(folder("[Gmail]/x", use))).toBeNull();
    }
    expect(imapTarget(folder("[Gmail]", undefined, ["\\Noselect", "\\HasChildren"]))).toBeNull();
  });

  it("turns labels into folders with their nesting", () => {
    expect(imapTarget(folder("Kunden/Hoffmann"))).toEqual({
      role: null,
      path: ["Kunden", "Hoffmann"],
    });
  });

  it("puts the inbox first", () => {
    const targets = [
      { role: null, path: ["A"] },
      { role: "inbox", path: [] },
    ];
    expect(targets.sort(folderOrder)[0]?.role).toBe("inbox");
  });
});

describe("keywordsOf", () => {
  it("turns IMAP flags into JMAP keywords", () => {
    expect(keywordsOf(["\\Seen", "\\Flagged", "\\Recent", "$Forwarded"])).toEqual({
      $seen: true,
      $flagged: true,
      $forwarded: true,
    });
  });
});
