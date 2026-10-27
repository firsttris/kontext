/**
 * A stand-in for Photon (komoot's geocoder, /api with `q`, `limit`, `lang`), so the place
 * suggestions of an appointment's "Ort" work in tests without the internet. It answers a GeoJSON
 * FeatureCollection as Photon does (komoot/photon docs/api-v1.md) with the places below whose
 * words all occur in them.
 *
 *   bun dev/fake-places.ts                 # http://127.0.0.1:18099
 *   bun dev/fake-places.ts --port 28099    # the e2e tests
 *
 * Kontext then needs PLACES_URL=http://127.0.0.1:<port>/api/.
 */
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: { port: { type: "string", default: "18099" } } });
const port = Number(args.port);

type Properties = Record<string, string>;

const place = (properties: Properties, lon: number, lat: number) => ({
  type: "Feature",
  properties: { countrycode: "DE", country: "Deutschland", ...properties },
  geometry: { type: "Point", coordinates: [lon, lat] },
});

export const FAKE_PLACES = [
  place(
    {
      name: "Bäckerei Müller",
      street: "Hauptstraße",
      housenumber: "5",
      postcode: "79098",
      city: "Freiburg im Breisgau",
    },
    7.8506,
    47.9959,
  ),
  place(
    {
      name: "Bäckerei Müller",
      street: "Bahnhofstraße",
      housenumber: "2",
      postcode: "79312",
      city: "Emmendingen",
    },
    7.8494,
    48.1211,
  ),
  place(
    { name: "Hauptstraße", street: "Hauptstraße", postcode: "79104", city: "Freiburg" },
    7.85,
    48,
  ),
];

const searchable = (feature: (typeof FAKE_PLACES)[number]) =>
  Object.values(feature.properties).join(" ").toLowerCase();

const matching = (query: string, limit: number) => {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return FAKE_PLACES.filter((feature) =>
    words.every((word) => searchable(feature).includes(word)),
  ).slice(0, limit);
};

if (import.meta.main) {
  Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname === "/") return new Response("ok");
      if (url.pathname !== "/api/") return new Response("Not found", { status: 404 });
      const features = matching(
        url.searchParams.get("q") ?? "",
        Number(url.searchParams.get("limit") ?? 15),
      );
      return Response.json({ type: "FeatureCollection", features });
    },
  });
  console.log(`Fake-Photon läuft: http://127.0.0.1:${port}/api/`);
}
