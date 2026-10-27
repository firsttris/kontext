/**
 * Place suggestions for an appointment's "Ort": the question for Photon (komoot's geocoder on
 * OpenStreetMap) and its answer, a GeoJSON FeatureCollection, as one-line German addresses. Pure.
 * The fields are Photon's (komoot/photon docs/api-v1.md and
 * src/main/java/de/komoot/photon/searcher/GeoJsonFields.java), after the GeocodeJSON spec.
 */

/** A suggestion as the app shows and keeps it. */
export type Place = { label: string; lat: number; lon: number };

/** Fewer letters find everything and nothing; more is no place name any more. */
export const MIN_QUERY = 3;
export const MAX_QUERY = 120;
export const LIMIT = 5;

type PhotonProperties = {
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  locality?: string;
  state?: string;
  country?: string;
  countrycode?: string;
};

type PhotonFeature = {
  properties?: PhotonProperties;
  geometry?: { coordinates?: unknown };
};

const clean = (value: unknown): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

/** The text to look for, trimmed and capped, or null when it is too short. */
export const placeQuery = (text: string | undefined): string | null => {
  const query = clean(text).slice(0, MAX_QUERY).trim();
  return query.length >= MIN_QUERY ? query : null;
};

/** Photon's search address for a query: `?q=…&limit=5&lang=de` on the configured base. */
export const placesRequestUrl = (base: string, query: string): string => {
  const url = new URL(base);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(LIMIT));
  url.searchParams.set("lang", "de");
  return url.toString();
};

/** Parts that are empty or repeat an earlier one (a street's name is the street) are left out. */
const distinct = (parts: string[]): string[] =>
  parts.filter(
    (part, index) =>
      part && parts.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index,
  );

/**
 * "Bäckerei Müller, Hauptstraße 5, 79098 Freiburg": name, street with number, postcode with town,
 * as an address is written in Germany; the state when there is no town, the country outside
 * Germany. A house number without its street says nothing and is left out.
 */
export const placeLabel = (properties: PhotonProperties): string => {
  const street = clean(properties.street);
  const streetLine = street ? `${street} ${clean(properties.housenumber)}`.trim() : "";
  const town = clean(properties.city) || clean(properties.locality);
  const townLine = `${clean(properties.postcode)} ${town}`.trim();
  const abroad =
    clean(properties.countrycode).toUpperCase() !== "DE" ? clean(properties.country) : "";
  return distinct([
    clean(properties.name),
    streetLine,
    townLine || clean(properties.state),
    abroad,
  ]).join(", ");
};

/** GeoJSON points are [longitude, latitude]. */
const point = (feature: PhotonFeature): { lat: number; lon: number } | null => {
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const [lon, lat] = coordinates;
  return typeof lon === "number" && typeof lat === "number" ? { lat, lon } : null;
};

const toPlace = (feature: PhotonFeature): Place | null => {
  const label = placeLabel(feature?.properties ?? {});
  const at = feature ? point(feature) : null;
  return label && at ? { label, ...at } : null;
};

/** The places in Photon's answer, each label once; anything else is no place. */
export const parsePlaces = (answer: unknown): Place[] => {
  const features = (answer as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];
  return features
    .map((feature) => toPlace(feature as PhotonFeature))
    .filter((place): place is Place => place !== null)
    .filter(
      (place, index, all) =>
        all.findIndex((other) => other.label.toLowerCase() === place.label.toLowerCase()) === index,
    )
    .slice(0, LIMIT);
};
