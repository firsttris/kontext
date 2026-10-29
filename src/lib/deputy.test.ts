import { describe, expect, it } from "vitest";
import {
  accessIn,
  type DeputyObjects,
  deputyOverview,
  deputyRights,
  grantPatches,
  hasPatches,
  revokePatches,
} from "./deputy";
import { rightsFor } from "./sharing";

const availability = rightsFor("availability", "calendar")!;

const objects = (): DeputyObjects => ({
  mailbox: [
    { id: "inbox", shareWith: {} },
    { id: "sent", shareWith: null },
  ],
  calendar: [{ id: "work", shareWith: { max: availability, anna: availability } }],
  addressBook: [{ id: "book", shareWith: { anna: rightsFor("read", "addressBook")! } }],
});

describe("deputy", () => {
  it("reads mailbox access like the toolbar does", () => {
    expect(accessIn("mailbox", undefined)).toBe("none");
    expect(accessIn("mailbox", { mayReadItems: true, maySetSeen: true })).toBe("read");
    expect(accessIn("mailbox", deputyRights("mailbox", "edit"))).toBe("edit");
    expect(accessIn("calendar", availability)).toBe("availability");
  });

  it("lets a mailbox deputy file and delete mails but not send, rename or share", () => {
    expect(deputyRights("mailbox", "edit")).toMatchObject({
      mayReadItems: true,
      mayAddItems: true,
      mayRemoveItems: true,
      maySubmit: false,
      mayRename: false,
      mayShare: false,
    });
    expect(deputyRights("mailbox", "read")).toMatchObject({
      mayReadItems: true,
      maySetSeen: true,
      mayRemoveItems: false,
    });
    expect(deputyRights("calendar", "read")).toEqual(rightsFor("read", "calendar"));
  });

  it("grants the chosen level on every object of the ticked kinds only", () => {
    const patches = grantPatches(objects(), "max", "read", ["mailbox", "calendar"]);
    expect(Object.keys(patches.mailbox)).toEqual(["inbox", "sent"]);
    expect(patches.mailbox.inbox).toEqual({ "shareWith/max": deputyRights("mailbox", "read") });
    expect(patches.calendar.work).toEqual({ "shareWith/max": rightsFor("read", "calendar") });
    expect(patches.addressBook).toEqual({});
  });

  it("leaves objects alone that already have the level, and lowers a higher one", () => {
    const current = objects();
    current.mailbox[0]!.shareWith = { max: deputyRights("mailbox", "read") };
    current.mailbox[1]!.shareWith = { max: deputyRights("mailbox", "edit") };
    const patches = grantPatches(current, "max", "read", ["mailbox"]);
    expect(Object.keys(patches.mailbox)).toEqual(["sent"]);
  });

  it("changes nothing when the mailbox already has what Stalwart stores for the level", () => {
    // Stalwart maps maySetSeen and maySetKeywords to the same ACL (ModifyItems,
    // crates/jmap-proto/src/object/mailbox.rs), so a folder shared for reading reads back with both.
    const current = objects();
    for (const mailbox of current.mailbox) {
      mailbox.shareWith = {
        max: { ...deputyRights("mailbox", "read"), maySetSeen: true, maySetKeywords: true },
      };
    }
    expect(grantPatches(current, "max", "read", ["mailbox"]).mailbox).toEqual({});
  });

  it("revokes everything above free and busy times, also from the share dialogs", () => {
    const current = objects();
    current.mailbox[0]!.shareWith = { max: deputyRights("mailbox", "edit") };
    current.calendar[0]!.shareWith = { max: rightsFor("edit", "calendar")!, anna: availability };
    current.addressBook[0]!.shareWith = { max: rightsFor("read", "addressBook")! };
    const patches = revokePatches(current, "max", ["max", "anna"]);
    expect(patches.mailbox).toEqual({ inbox: { "shareWith/max": null } });
    // Anna sees the free and busy times, so Max keeps them like every colleague.
    expect(patches.calendar).toEqual({ work: { "shareWith/max": availability } });
    expect(patches.addressBook).toEqual({ book: { "shareWith/max": null } });
  });

  it("removes a calendar entry entirely when colleagues do not all see free and busy times", () => {
    const current = objects();
    current.calendar[0]!.shareWith = { max: rightsFor("read", "calendar")! };
    const patches = revokePatches(current, "max", ["max", "anna"]);
    expect(patches.calendar).toEqual({ work: { "shareWith/max": null } });
  });

  it("does not touch other people or free and busy times alone", () => {
    const patches = revokePatches(objects(), "max", ["max", "anna"]);
    expect(hasPatches(patches)).toBe(false);
    expect(hasPatches(revokePatches(objects(), "anna", ["max", "anna"]))).toBe(true);
    expect(revokePatches(objects(), "anna", ["max", "anna"]).calendar).toEqual({});
  });

  it("shows who can read or change what, without free and busy times alone", () => {
    const current = objects();
    current.mailbox[0]!.shareWith = { max: deputyRights("mailbox", "read") };
    current.calendar[0]!.shareWith = { max: rightsFor("edit", "calendar")!, anna: availability };
    expect(deputyOverview(current)).toEqual([
      {
        principalId: "max",
        kinds: {
          mailbox: { level: "read", count: 1, total: 2 },
          calendar: { level: "edit", count: 1, total: 1 },
        },
      },
      { principalId: "anna", kinds: { addressBook: { level: "read", count: 1, total: 1 } } },
    ]);
  });
});
