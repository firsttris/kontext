// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createFaxes, isPdf } from "./fax";
import { faxCall } from "./phone";
import type { PhoneSettings } from "./store";

const call = faxCall(
  {
    type: "event",
    seq: 1,
    call: "1729.5",
    state: "fax",
    direction: "in",
    remote: "07223 812345",
    local: "",
    at: "2026-10-26T08:14:00.000Z",
  },
  { id: "c5", boxId: "b1", members: ["jonas"] },
);

describe("a fax", () => {
  const pdf = new TextEncoder().encode("%PDF-1.4 fax pages");

  it("stays at the call and goes as a PDF mail to the chosen mailbox", async () => {
    const saved: string[] = [];
    const set: string[] = [];
    const imported: string[] = [];
    const faxes = createFaxes({
      store: {
        callOfBox: async (boxId) => (boxId === "b1" ? call : null),
        setFax: async (id, state) => void set.push(`${id}:${state}`),
        settings: async () =>
          ({
            fax: {
              enabled: true,
              line: "k629",
              deliverTo: { accountId: "info", email: "info@firma.test" },
            },
          }) as PhoneSettings,
      },
      files: { saveFax: async (id) => void saved.push(id) },
      refresh: async () => undefined,
      importMessage: async (accountId, message) => {
        imported.push(
          `${accountId}:${new TextDecoder().decode(message).includes("Subject: Fax von 07223 812345")}`,
        );
        return { ok: true, emailId: "e1" };
      },
    });
    expect(await faxes.receive("b1", "1729.5", pdf)).toBe("ok");
    expect(saved).toEqual(["c5"]);
    expect(set).toEqual(["c5:received"]);
    expect(imported).toEqual(["info:true"]);
    expect(await faxes.receive("b2", "1729.5", pdf)).toBe("not-found");
    expect(await faxes.receive("b1", "1729.5", new TextEncoder().encode("not a pdf at all"))).toBe(
      "bad-file",
    );
  });

  it("knows a PDF", () => {
    expect(isPdf(pdf)).toBe(true);
    expect(isPdf(new TextEncoder().encode("RIFF....WAVE"))).toBe(false);
  });
});
