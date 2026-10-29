import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/** A calendar on the web, as a school or a waste collector has it; its content can change. */
export const calendarOnTheWeb = async () => {
  let titles: string[] = [];
  const server = createServer((_request, response) => {
    const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" })
      .format(new Date(Date.now() + 86_400_000))
      .replace(/-/g, "");
    const events = titles.map((title, index) =>
      [
        "BEGIN:VEVENT",
        `UID:${title.replace(/\W/g, "")}-${index}@schule.test`,
        "DTSTAMP:20261001T000000Z",
        `DTSTART;VALUE=DATE:${day}`,
        `SUMMARY:${title}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ].join("\r\n"),
    );
    response.writeHead(200, { "content-type": "text/calendar; charset=utf-8" });
    response.end(
      ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:test", ...events, "END:VCALENDAR"].join("\r\n"),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}/ferien.ics`,
    serve: (next: string[]) => {
      titles = next;
    },
    close: () => server.close(),
  };
};
