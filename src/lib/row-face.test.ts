import { describe, expect, it } from "vitest";
import { rowFace } from "./row-face";

const anna = { name: "Anna Weber", email: "anna@weber.test" };
const kunde = { name: "Kunde", email: "kunde@example.test" };
const AUTH = "header:Authentication-Results:asText:all";

describe("rowFace", () => {
  it("shows the sender of a mail that came in", () => {
    expect(rowFace({ from: [anna], to: [kunde] }, { showRecipient: false })).toEqual({
      name: "Anna Weber",
      photo: { email: "anna@weber.test" },
    });
  });

  it("shows the first recipient where the list names recipients (Sent)", () => {
    expect(rowFace({ from: [anna], to: [kunde, anna] }, { showRecipient: true })).toEqual({
      name: "Kunde",
      photo: { email: "kunde@example.test" },
    });
    expect(rowFace({ from: [anna], to: null }, { showRecipient: true })).toEqual({
      name: "",
      photo: {},
    });
  });

  it("shows the latest sender of a conversation shown as one line", () => {
    const latest = { from: [kunde], to: null };
    expect(rowFace({ from: [anna], to: null }, { showRecipient: false, latest })).toEqual({
      name: "Kunde",
      photo: { email: "kunde@example.test" },
    });
  });

  it("gives a forged sender no one's photo, only the name for the initials", () => {
    const forged = {
      from: [anna],
      to: null,
      [AUTH]: [
        "mx.weber.test; spf=fail smtp.mailfrom=evil.example; dmarc=fail header.from=weber.test",
      ],
    };
    expect(rowFace(forged, { showRecipient: false })).toEqual({ name: "Anna Weber", photo: {} });
    const grouped = rowFace({ from: [anna], to: null }, { showRecipient: false, latest: forged });
    expect(grouped.photo).toEqual({});
  });
});
