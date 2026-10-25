import { describe, expect, it } from "vitest";
import { decodePayload, encodePayload, sealedFiles } from "./sealed-chat";

const plan = { id: "f1", name: "Gehaltsliste.pdf", type: "application/pdf", size: 1200 };

describe("confidential chat payload", () => {
  it("is the bare text without files, as older messages are", () => {
    expect(encodePayload("Hallo", [])).toBe("Hallo");
    expect(decodePayload("Hallo")).toEqual({ text: "Hallo", files: [] });
  });

  it("carries the real names of the files", () => {
    const plain = encodePayload("Anbei", [{ ...plan, thumb: true }]);
    expect(decodePayload(plain)).toEqual({ text: "Anbei", files: [plan] });
  });

  it("keeps a text that only looks like the format", () => {
    expect(decodePayload('{"kontext-sealed": kaputt')).toEqual({
      text: '{"kontext-sealed": kaputt',
      files: [],
    });
  });

  it("shows only files the server attached to the message", () => {
    const payload = { text: "", files: [plan, { ...plan, id: "fremd" }] };
    expect(sealedFiles(payload, [{ ...plan, name: "verschlüsselt" }])).toEqual([plan]);
  });
});
