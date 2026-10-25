// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { readOnlyInbox, requestOf, sampleSessionInfo, writableInbox } from "./sample-session";

afterEach(() => vi.unstubAllGlobals());

describe("the accounts of a sign-in", () => {
  it("tells a member of info@ from who only reads it, and leaves out a colleague's own account", async () => {
    const { accountsOf } = sampleSessionInfo({
      // Anna shared her address book with Jonas: her account is in his session, without folders.
      jonas: { info: { member: true }, anna: { folders: [] } },
      max: { info: { folders: [readOnlyInbox, { role: "archive" }] } },
    });
    expect(await accountsOf(requestOf("jonas"))).toEqual([
      { id: "jonas", name: "jonas@w.test", isPersonal: true, isReadOnly: false },
      { id: "info", name: "info@w.test", isPersonal: false, isReadOnly: false },
    ]);
    expect(await accountsOf(requestOf("max"))).toEqual([
      { id: "max", name: "max@w.test", isPersonal: true, isReadOnly: false },
      { id: "info", name: "info@w.test", isPersonal: false, isReadOnly: true },
    ]);
  });

  it("may change a mailbox handed over to them", async () => {
    const { accountsOf } = sampleSessionInfo({ sandra: { lea: { folders: [writableInbox] } } });
    expect((await accountsOf(requestOf("sandra")))?.[1]).toEqual({
      id: "lea",
      name: "lea@w.test",
      isPersonal: false,
      isReadOnly: false,
    });
  });
});
