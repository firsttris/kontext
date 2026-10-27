// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SessionAccount } from "../categories/routes";
import { createPlaceRoutes } from "./routes";

const jonas: SessionAccount[] = [{ id: "jonas", isPersonal: true, isReadOnly: false }];
const photon = {
  features: [
    {
      properties: { name: "Rathaus", street: "Marktplatz", housenumber: "1", city: "Emmendingen" },
      geometry: { coordinates: [7.85, 48.12] },
    },
  ],
};

const routes = (fetch: typeof globalThis.fetch, url = "https://photon.test/api/") =>
  createPlaceRoutes({
    url,
    userAgent: "Kontext/test",
    accountsOf: async () => jonas,
    fetch,
  });

const places = async (response: Response) =>
  ((await response.json()) as { places: { label: string }[] }).places;

describe("/api/places", () => {
  it("asks Photon with Kontext's User-Agent and answers with labels", async () => {
    const fetch = vi.fn(async () => Response.json(photon));
    const response = await routes(fetch as never).request("/?q=Rathaus%20Emmendingen");
    expect(response.status).toBe(200);
    expect(await places(response)).toEqual([
      { label: "Rathaus, Marktplatz 1, Emmendingen", lat: 48.12, lon: 7.85 },
    ]);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(url).searchParams.get("q")).toBe("Rathaus Emmendingen");
    expect(new Headers(init.headers).get("user-agent")).toBe("Kontext/test");
  });

  it("asks nobody for short text or when PLACES_URL is empty", async () => {
    const fetch = vi.fn(async () => Response.json(photon));
    expect(await places(await routes(fetch as never).request("/?q=ab"))).toEqual([]);
    expect(await places(await routes(fetch as never, "").request("/?q=Rathaus"))).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("is an empty list when Photon fails or is away", async () => {
    const failing = vi.fn(async () => new Response("busy", { status: 429 }));
    expect(await places(await routes(failing as never).request("/?q=Rathaus"))).toEqual([]);
    const away = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await places(await routes(away as never).request("/?q=Rathaus"))).toEqual([]);
    const garbage = vi.fn(async () => new Response("<html>"));
    expect(await places(await routes(garbage as never).request("/?q=Rathaus"))).toEqual([]);
  });

  it("answers only signed-in people", async () => {
    const fetch = vi.fn(async () => Response.json(photon));
    const response = await createPlaceRoutes({
      url: "https://photon.test/api/",
      userAgent: "Kontext/test",
      accountsOf: async () => null,
      fetch: fetch as never,
    }).request("/?q=Rathaus");
    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });
});
