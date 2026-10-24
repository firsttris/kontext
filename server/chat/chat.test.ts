import { describe, expect, it } from "vitest";
import { canSee, channelName, directKey, newChannelSchema } from "./chat";

const jonas = { me: "jonas", accountIds: ["jonas", "info"] };
const max = { me: "max", accountIds: ["max"] };

describe("canSee", () => {
  it("shows #allgemein to everyone", () => {
    expect(canSee({ kind: "team", accountId: null, members: [] }, max)).toBe(true);
  });

  it("shows a mailbox channel to whoever can open the mailbox", () => {
    const info = { kind: "mailbox" as const, accountId: "info", members: [] };
    expect(canSee(info, jonas)).toBe(true);
    expect(canSee(info, max)).toBe(false);
  });

  it("shows named and direct channels to their members only", () => {
    const direct = { kind: "direct" as const, accountId: null, members: ["jonas", "anna"] };
    expect(canSee(direct, jonas)).toBe(true);
    expect(canSee(direct, max)).toBe(false);
  });
});

describe("channelName", () => {
  it("makes a short name with dashes", () => {
    expect(channelName("  #Baustelle Hoffmann ")).toBe("baustelle-hoffmann");
    expect(channelName("Bad_OG: Fliesen!")).toBe("bad-og-fliesen");
    expect(channelName("Größe – Übersicht")).toBe("größe-übersicht");
  });

  it("refuses a name without letters", () => {
    expect(newChannelSchema.safeParse({ name: " # ! ", members: [] }).success).toBe(false);
  });
});

describe("directKey", () => {
  it("is the same for the same people in any order", () => {
    expect(directKey(["b", "a", "b"])).toBe(directKey(["a", "b"]));
  });
});
