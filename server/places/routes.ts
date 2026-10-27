/**
 * /api/places?q=…: place suggestions for an appointment's "Ort", asked of Photon by the server so
 * the browser talks only to Kontext (CSP `connect-src 'self'`) and the person's address stays here.
 * What they type does go to the configured geocoder; an empty PLACES_URL turns that off. Every
 * failure on the way is an empty list: the field then works as plain text.
 */
import { Hono } from "hono";
import type { SessionAccount } from "../categories/routes";
import { type Place, parsePlaces, placeQuery, placesRequestUrl } from "./places";

const TIMEOUT_MS = 4_000;

export type PlacesDeps = {
  /** Photon's /api address; empty means no suggestions. */
  url: string;
  /** Who asks, for OSM's and komoot's fair use (a real User-Agent, no anonymous scraping). */
  userAgent: string;
  accountsOf: (request: Request) => Promise<SessionAccount[] | null>;
  fetch?: typeof fetch;
};

/** The places for a query, or none when the geocoder is off, slow or answers nonsense. */
export const lookUpPlaces =
  ({ url, userAgent, fetch: get = fetch }: Omit<PlacesDeps, "accountsOf">) =>
  async (query: string): Promise<Place[]> => {
    if (!url) return [];
    const response = await get(placesRequestUrl(url, query), {
      headers: { "user-agent": userAgent, accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch(() => null);
    if (!response?.ok) return [];
    return parsePlaces(await response.json().catch(() => null));
  };

export const createPlaceRoutes = ({ accountsOf, ...source }: PlacesDeps) => {
  const app = new Hono();
  const lookUp = lookUpPlaces(source);

  app.get("/", async (c) => {
    if (!(await accountsOf(c.req.raw))) return c.json({ error: "Nicht angemeldet" }, 401);
    const query = placeQuery(c.req.query("q"));
    const places = query ? await lookUp(query) : [];
    return c.json({ places }, 200, { "cache-control": "private, max-age=300" });
  });

  return app;
};
