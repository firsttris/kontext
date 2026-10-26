// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { openImap } from "./imap-source";

describe("opening a mailbox", () => {
  it("never connects to a server inside the network", async () => {
    const pin = vi.fn(async () => null);
    const opened = await openImap(
      { host: "imap.rebind.test", port: 993 },
      { user: "a", password: "b" },
      false,
      pin,
    );
    expect(pin).toHaveBeenCalledWith("imap.rebind.test");
    expect(opened).toMatchObject({ ok: false, error: { reason: "outside" } });
  });
});
