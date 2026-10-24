import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listItems } from "./pst";

let dir = "";
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("listItems", () => {
  it("finds mails, contacts and appointments by folder, in order", async () => {
    dir = await mkdtemp(join(tmpdir(), "pst-"));
    const inbox = join(dir, "Persönliche Ordner", "Posteingang");
    await mkdir(inbox, { recursive: true });
    await mkdir(join(dir, "Persönliche Ordner", "Kontakte"), { recursive: true });
    for (const name of ["10.eml", "2.eml", "notes.txt"]) await writeFile(join(inbox, name), "x");
    await writeFile(join(dir, "Persönliche Ordner", "Kontakte", "1.vcf"), "x");

    const items = await listItems(dir);
    expect(
      items.map((item) => [item.kind, item.folder.join("/"), item.file.split("/").pop()]),
    ).toEqual([
      ["contact", "Persönliche Ordner/Kontakte", "1.vcf"],
      ["mail", "Persönliche Ordner/Posteingang", "2.eml"],
      ["mail", "Persönliche Ordner/Posteingang", "10.eml"],
    ]);
  });
});
