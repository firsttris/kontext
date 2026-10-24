import { describe, expect, it } from "vitest";
import { targetFolder } from "./folders";

describe("targetFolder", () => {
  it("puts Outlook's special folders on their role, in German and English", () => {
    expect(targetFolder(["Persönliche Ordner", "Posteingang"])).toEqual({
      role: "inbox",
      path: [],
    });
    expect(targetFolder(["Outlook-Datendatei", "Gesendete Elemente"])).toEqual({
      role: "sent",
      path: [],
    });
    expect(targetFolder(["Personal Folders", "Deleted Items"])).toEqual({
      role: "trash",
      path: [],
    });
  });

  it("keeps subfolders under the special folder and other folders as they are", () => {
    expect(targetFolder(["Persönliche Ordner", "Posteingang", "Kunden", "Hoffmann"])).toEqual({
      role: "inbox",
      path: ["Kunden", "Hoffmann"],
    });
    expect(targetFolder(["Persönliche Ordner", "Projekte", "2025"])).toEqual({
      role: null,
      path: ["Projekte", "2025"],
    });
  });

  it("leaves out folders without mail", () => {
    expect(targetFolder(["Persönliche Ordner", "Aufgaben"])).toBeNull();
    expect(targetFolder(["Persönliche Ordner", "Notizen", "Alt"])).toBeNull();
  });
});
