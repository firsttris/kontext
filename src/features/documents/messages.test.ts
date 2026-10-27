import { describe, expect, it } from "vitest";
import {
  framePathOf,
  frameSrcOf,
  isEditorPath,
  kontextPathOf,
  readFrameMessage,
  splatOf,
} from "./messages";

const frame = {};
const origin = "https://dokumente.firma.de";

describe("readFrameMessage", () => {
  it("takes Schreibzeug's messages from its frame", () => {
    const event = {
      origin,
      source: frame,
      data: { source: "schreibzeug", type: "route", path: "/" },
    };
    expect(readFrameMessage(event, { origin, frame })).toEqual(event.data);
  });

  it("ignores other origins, other windows and other shapes", () => {
    const data = { source: "schreibzeug", type: "unsaved", unsaved: true };
    expect(
      readFrameMessage({ origin: "https://evil.example", source: frame, data }, { origin, frame }),
    ).toBeNull();
    expect(readFrameMessage({ origin, source: {}, data }, { origin, frame })).toBeNull();
    expect(
      readFrameMessage({ origin, source: frame, data: { type: "unsaved" } }, { origin, frame }),
    ).toBeNull();
  });
});

describe("paths", () => {
  it("maps Kontext's paths to Schreibzeug's and back", () => {
    expect(framePathOf("/documents")).toBe("/");
    expect(framePathOf("/documents/edit/1")).toBe("/edit/1");
    expect(framePathOf("/documents//evil.example")).toBe("/");
    expect(kontextPathOf("/")).toBe("/documents");
    expect(kontextPathOf("/folders/2?embedded=kontext")).toBe("/documents/folders/2");
    expect(splatOf("/edit/1?x=1")).toBe("edit/1");
  });

  it("tells an open file from the lists", () => {
    expect(isEditorPath("/documents/edit/1")).toBe(true);
    expect(isEditorPath("/documents")).toBe(false);
    expect(isEditorPath("/documents/folders/2")).toBe(false);
    expect(isEditorPath("/mail")).toBe(false);
  });

  it("opens the frame embedded", () => {
    expect(frameSrcOf(origin, "/edit/1")).toBe(`${origin}/edit/1?embedded=kontext`);
  });
});
