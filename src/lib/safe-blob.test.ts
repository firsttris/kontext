import { describe, expect, it } from "vitest";
import { asDownload, asFile, asViewable, imageUrl, viewableType } from "./safe-blob";

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
