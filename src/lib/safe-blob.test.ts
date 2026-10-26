import { describe, expect, it } from "vitest";
import { asDownload, asFile, asViewable, imageUrl, sniffRaster, viewableType } from "./safe-blob";

describe("blobs from mails", () => {
  it("open only PDFs and raster images in a tab, whatever the case of their type", () => {
    expect(viewableType("application/pdf")).toBe("application/pdf");
    expect(viewableType("IMAGE/PNG; name=x.png")).toBe("image/png");
    expect(viewableType("text/html")).toBeNull();
    expect(viewableType("image/svg+xml")).toBeNull();
    expect(viewableType("IMAGE/SVG+XML")).toBeNull();
    expect(asViewable(new Blob(["<script>"], { type: "text/html" }))).toBeNull();
    expect(asViewable(new Blob(["%PDF"], { type: "application/pdf" }))?.type).toBe(
      "application/pdf",
    );
  });

  it("make download links plain downloads", () => {
    expect(asDownload("<script>").type).toBe("application/octet-stream");
    expect(asFile("x", "text/html").type).toBe("application/octet-stream");
    expect(asFile("x", "image/svg+xml").type).toBe("application/octet-stream");
    expect(asFile("x", "image/JPEG").type).toBe("image/jpeg");
  });

  it("give images a URL a tab cannot run, and nothing else one at all", async () => {
    expect(await imageUrl(new Blob(["<html>"], { type: "text/html" }))).toBeNull();
    const svg = await imageUrl(new Blob(["<svg/>"], { type: "Image/SVG+XML" }));
    expect(svg).toBe(`data:image/svg+xml;base64,${btoa("<svg/>")}`);
  });
});

describe("inline images whose part names no image type", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

  it("are known by their first bytes", () => {
    expect(sniffRaster(PNG)).toBe("image/png");
    expect(sniffRaster(JPEG)).toBe("image/jpeg");
    expect(sniffRaster(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
    expect(sniffRaster(new TextEncoder().encode("<html><script>"))).toBeNull();
  });

  it("still get a URL, typed as what they are", async () => {
    const created: Blob[] = [];
    const real = URL.createObjectURL;
    URL.createObjectURL = (blob: Blob) => {
      created.push(blob);
      return "blob:x";
    };
    for (const type of ["application/octet-stream", "image/pjpeg", "image/x-png"]) {
      expect(await imageUrl(new Blob([PNG], { type })), type).toBe("blob:x");
    }
    expect(created.map((blob) => blob.type)).toEqual(["image/png", "image/png", "image/png"]);
    expect(await imageUrl(new Blob(["<html>"], { type: "application/octet-stream" }))).toBeNull();
    URL.createObjectURL = real;
  });
});
