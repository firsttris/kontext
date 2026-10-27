import { describe, expect, it } from "vitest";
import { addressKey, inlinePhoto, mailSenderKey, photoFinder, squareCrop } from "./photo";

describe("photos", () => {
  it("cuts the centred square", () => {
    expect(squareCrop(400, 300)).toEqual({ x: 50, y: 0, side: 300 });
    expect(squareCrop(300, 500)).toEqual({ x: 0, y: 100, side: 300 });
    expect(squareCrop(256, 256)).toEqual({ x: 0, y: 0, side: 256 });
  });

  it("shows contact photos carried in the card, never links to elsewhere", () => {
    expect(inlinePhoto("data:image/jpeg;base64,/9j/4AAQ")).toBe("data:image/jpeg;base64,/9j/4AAQ");
    expect(inlinePhoto("data:image/png;base64,iVBOR")).toBe("data:image/png;base64,iVBOR");
    expect(inlinePhoto("data:image/svg+xml;base64,PHN2Zz4=")).toBeUndefined();
    expect(inlinePhoto("https://tracker.example/me.jpg")).toBeUndefined();
  });

  it("reads the type of a photo synced from an iPhone, which comes without one", () => {
    // vCard 3.0 PHOTO;ENCODING=b;TYPE=JPEG becomes "data:;base64,…" in Stalwart (calcard 0.3.14).
    expect(inlinePhoto("data:;base64,/9j/4AAQSkZJRgABAQ==")).toBe(
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==",
    );
    expect(inlinePhoto("data:;base64,iVBORw0KGgoAAAANSUhEUg==")).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    );
    expect(inlinePhoto("data:application/octet-stream;base64,R0lGODlhAQABAA==")).toBe(
      "data:image/gif;base64,R0lGODlhAQABAA==",
    );
    // An SVG or anything else without a type stays out.
    expect(inlinePhoto("data:;base64,PHN2ZyB4bWxucz0=")).toBeUndefined();
    expect(inlinePhoto("data:text/html;base64,/9j/4AAQ")).toBeUndefined();
  });

  it("compares addresses without case", () => {
    expect(addressKey(" Jonas@Firma.DE ")).toBe("jonas@firma.de");
    expect(addressKey(null)).toBe("");
  });
});

describe("photoFinder", () => {
  const find = photoFinder({
    versions: { jonas: 17 },
    colleagues: [
      { id: "jonas", email: "jonas@weber.test" },
      { id: "anna", email: "anna@weber.test" },
    ],
    contacts: new Map([
      ["petra@keller.test", "data:image/jpeg;base64,petra"],
      ["jonas@weber.test", "data:image/jpeg;base64,old"],
    ]),
  });

  it("takes a colleague's own photo, by account id or address", () => {
    expect(find({ id: "jonas" })).toBe("/api/photos/jonas?v=17");
    expect(find({ email: "Jonas@Weber.test" })).toBe("/api/photos/jonas?v=17");
  });

  it("else the contact's photo, else none", () => {
    expect(find({ email: "petra@keller.test" })).toBe("data:image/jpeg;base64,petra");
    expect(find({ id: "anna", email: "anna@weber.test" })).toBeUndefined();
    expect(find({})).toBeUndefined();
  });
});

describe("mailSenderKey", () => {
  const chef = { name: "Chef", email: "chef@weber.test" };
  it("shows a sender's photo when the mail is theirs, or was checked by nobody", () => {
    expect(mailSenderKey(chef, null)).toEqual({ email: "chef@weber.test" });
    expect(mailSenderKey(chef, ["mx.weber.test; dmarc=pass header.from=weber.test"])).toEqual({
      email: "chef@weber.test",
    });
  });
  it("never for a forged sender", () => {
    expect(
      mailSenderKey(chef, ["mx.weber.test; spf=fail smtp.mailfrom=evil.test; dmarc=fail"]),
    ).toEqual({});
    expect(mailSenderKey(undefined, null)).toEqual({});
  });
});
