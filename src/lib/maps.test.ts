import { describe, expect, it } from "vitest";
import { isMapPlace, mapsUrl } from "./maps";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/126 Mobile";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126";
const PLACE = "Bäckerei Müller, Hauptstraße 5, 79098 Freiburg";

describe("mapsUrl", () => {
  it("opens Apple Maps on iPhone, iPad and Mac", () => {
    const apple = `https://maps.apple.com/?q=${encodeURIComponent(PLACE)}`;
    expect(mapsUrl(PLACE, IPHONE)).toBe(apple);
    expect(mapsUrl(PLACE, MAC)).toBe(apple);
  });

  it("opens Google Maps elsewhere", () => {
    const google = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(PLACE)}`;
    expect(mapsUrl(PLACE, ANDROID)).toBe(google);
    expect(mapsUrl(`  ${PLACE} `, WINDOWS)).toBe(google);
  });

  it("encodes what would break the address", () => {
    expect(mapsUrl("Weg 1 & 2 #3", WINDOWS)).toContain("query=Weg%201%20%26%202%20%233");
  });

  it("has nothing for meeting links, web addresses or nothing", () => {
    expect(mapsUrl("https://meet.example.com/abc", IPHONE)).toBeNull();
    expect(mapsUrl("www.example.com", WINDOWS)).toBeNull();
    expect(mapsUrl("zoom.us/j/123", WINDOWS)).toBeNull();
    expect(mapsUrl("   ", WINDOWS)).toBeNull();
    // Outlook joins a booked room and a Zoom location with "; ".
    expect(mapsUrl("Konferenzraum 1; https://us02web.zoom.us/j/85012345678", WINDOWS)).toBeNull();
    expect(mapsUrl("Raum 2, www.example.com/meet", WINDOWS)).toBeNull();
  });
});

describe("isMapPlace", () => {
  it("takes rooms and addresses, also with dots", () => {
    expect(isMapPlace("Besprechungsraum 2")).toBe(true);
    expect(isMapPlace("Hauptstr. 5, Freiburg")).toBe(true);
    expect(isMapPlace("St. Georgen")).toBe(true);
  });
});
