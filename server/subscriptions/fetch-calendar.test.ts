import { describe, expect, it } from "vitest";
import { calendarUrl, fetchCalendar, MAX_BYTES } from "./fetch-calendar";

const ICS = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n";
const publicDns = async (host: string) =>
  host === "intern.example" ? ["10.0.0.5"] : ["93.184.216.34"];

/** A fake web: per URL a response. */
const web = (pages: Record<string, () => Response>) => {
  const asked: string[] = [];
  const fetch = (async (input: URL | string) => {
    asked.push(String(input));
    const page = pages[String(input)];
    return page ? page() : new Response("nicht da", { status: 404 });
  }) as typeof globalThis.fetch;
  return { fetch, asked };
};

describe("calendarUrl", () => {
  it("reads webcal as https and refuses what is no web address", () => {
    expect(calendarUrl(" webcal://feiertage.example/de.ics ")?.href).toBe(
      "https://feiertage.example/de.ics",
    );
    expect(calendarUrl("file:///etc/passwd")).toBeNull();
    expect(calendarUrl("kein link")).toBeNull();
  });
});

describe("fetchCalendar", () => {
  it("fetches an iCal file from the internet", async () => {
    const { fetch } = web({ "https://kal.example/a.ics": () => new Response(ICS) });
    expect(
      await fetchCalendar("webcal://kal.example/a.ics", { fetch, resolve: publicDns }),
    ).toEqual({
      ok: true,
      text: ICS,
    });
  });

  it("refuses http, addresses inside and a redirect to inside", async () => {
    const { fetch, asked } = web({
      "https://kal.example/weg.ics": () =>
        new Response(null, { status: 302, headers: { location: "https://intern.example/x.ics" } }),
    });
    const deps = { fetch, resolve: publicDns };
    expect((await fetchCalendar("http://kal.example/a.ics", deps)).ok).toBe(false);
    expect((await fetchCalendar("https://intern.example/a.ics", deps)).ok).toBe(false);
    expect((await fetchCalendar("https://user:pw@kal.example/a.ics", deps)).ok).toBe(false);
    expect(await fetchCalendar("https://kal.example/weg.ics", deps)).toMatchObject({ ok: false });
    expect(asked).toEqual(["https://kal.example/weg.ics"]);
  });

  it("follows a redirect on the internet", async () => {
    const { fetch } = web({
      "https://kal.example/alt.ics": () =>
        new Response(null, { status: 301, headers: { location: "/neu.ics" } }),
      "https://kal.example/neu.ics": () => new Response(ICS),
    });
    expect(
      (await fetchCalendar("https://kal.example/alt.ics", { fetch, resolve: publicDns })).ok,
    ).toBe(true);
  });

  it("refuses what is no calendar, too large or not there", async () => {
    const { fetch } = web({
      "https://kal.example/html": () => new Response("<html></html>"),
      "https://kal.example/gross.ics": () => new Response(`${ICS}${"x".repeat(MAX_BYTES)}`),
    });
    const deps = { fetch, resolve: publicDns };
    expect(await fetchCalendar("https://kal.example/html", deps)).toEqual({
      ok: false,
      error: "Unter dieser Adresse liegt kein Kalender (iCal).",
    });
    expect(await fetchCalendar("https://kal.example/gross.ics", deps)).toEqual({
      ok: false,
      error: "Der Kalender ist größer als 5 MB.",
    });
    expect(await fetchCalendar("https://kal.example/fehlt.ics", deps)).toEqual({
      ok: false,
      error: "Der Kalender antwortet mit 404.",
    });
  });

  it("answers with an error, not a throw, for a broken redirect or a body that breaks off", async () => {
    const { fetch } = web({
      "https://kal.example/kaputt.ics": () =>
        new Response(null, { status: 302, headers: { location: "https://[kaputt/x.ics" } }),
      "https://kal.example/abbruch.ics": () =>
        new Response(
          new ReadableStream({
            start: (controller) => {
              controller.enqueue(new TextEncoder().encode("BEGIN:VCALENDAR\r\n"));
              controller.error(new Error("The operation timed out."));
            },
          }),
        ),
    });
    const deps = { fetch, resolve: publicDns };
    await expect(fetchCalendar("https://kal.example/kaputt.ics", deps)).resolves.toMatchObject({
      ok: false,
    });
    await expect(fetchCalendar("https://kal.example/abbruch.ics", deps)).resolves.toMatchObject({
      ok: false,
    });
  });
});
