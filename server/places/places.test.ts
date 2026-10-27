// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parsePlaces, placeLabel, placeQuery, placesRequestUrl } from "./places";

const feature = (properties: Record<string, string>, coordinates: unknown = [7.85, 47.99]) => ({
  type: "Feature",
  properties,
  geometry: { type: "Point", coordinates },
});

describe("placeLabel", () => {
  it("writes a shop as name, street with number, postcode with town", () => {
    expect(
      placeLabel({
        name: "Bäckerei Müller",
        street: "Hauptstraße",
        housenumber: "5",
        postcode: "79098",
        city: "Freiburg im Breisgau",
        countrycode: "DE",
        country: "Deutschland",
      }),
    ).toBe("Bäckerei Müller, Hauptstraße 5, 79098 Freiburg im Breisgau");
  });

  it("leaves out a street's name that is the street, and empty parts", () => {
    expect(
      placeLabel({ name: "Hauptstraße", street: "Hauptstraße", postcode: "", city: "Freiburg" }),
    ).toBe("Hauptstraße, Freiburg");
    expect(placeLabel({ street: "Hauptstraße", housenumber: "5", city: "Freiburg" })).toBe(
      "Hauptstraße 5, Freiburg",
    );
  });

  it("drops a house number without its street", () => {
    expect(placeLabel({ name: "Rathaus", housenumber: "1", city: "Emmendingen" })).toBe(
      "Rathaus, Emmendingen",
    );
  });

  it("names the state for a town, and the country abroad", () => {
    expect(placeLabel({ name: "Freiburg im Breisgau", state: "Baden-Württemberg" })).toBe(
      "Freiburg im Breisgau, Baden-Württemberg",
    );
    expect(
      placeLabel({ name: "Basel", city: "Basel", countrycode: "CH", country: "Schweiz" }),
    ).toBe("Basel, Schweiz");
  });

  it("uses the locality when there is no town", () => {
    expect(placeLabel({ name: "Hof Weber", postcode: "79312", locality: "Kollmarsreute" })).toBe(
      "Hof Weber, 79312 Kollmarsreute",
    );
  });
});

describe("parsePlaces", () => {
  it("reads Photon's features with their point, each label once", () => {
    const answer = {
      type: "FeatureCollection",
      features: [
        feature({ name: "Bäckerei Müller", street: "Hauptstraße", housenumber: "5", city: "X" }),
        feature({ name: "Bäckerei Müller", street: "Hauptstraße", housenumber: "5", city: "X" }),
        feature({ name: "Ohne Punkt" }, null),
        feature({}),
      ],
    };
    expect(parsePlaces(answer)).toEqual([
      { label: "Bäckerei Müller, Hauptstraße 5, X", lat: 47.99, lon: 7.85 },
    ]);
  });

  it("is an empty list for anything that is no FeatureCollection", () => {
    expect(parsePlaces(null)).toEqual([]);
    expect(parsePlaces({ message: "rate limited" })).toEqual([]);
    expect(parsePlaces({ features: [null, 3] })).toEqual([]);
  });
});

describe("placeQuery", () => {
  it("needs three letters and caps long text", () => {
    expect(placeQuery("  ab ")).toBeNull();
    expect(placeQuery(undefined)).toBeNull();
    expect(placeQuery("  Bäcker   Freiburg ")).toBe("Bäcker Freiburg");
    expect(placeQuery("x".repeat(500))).toHaveLength(120);
  });
});

describe("placesRequestUrl", () => {
  it("asks for five places in German", () => {
    const url = new URL(placesRequestUrl("https://photon.komoot.io/api/", "Hauptstraße 5"));
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/api/");
    expect(url.searchParams.get("q")).toBe("Hauptstraße 5");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("lang")).toBe("de");
  });
});
