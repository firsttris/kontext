/** WebDAV/CalDAV replies (RFC 4918, RFC 4791) as XML text, and the little read from requests. */

export const NS =
  'xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:CS="http://calendarserver.org/ns/" xmlns:A="http://apple.com/ns/ical/"';

export const xmlText = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One resource in a multistatus: its found properties (already XML). */
export const response = (href: string, props: string[]) =>
  `<D:response><D:href>${xmlText(href)}</D:href><D:propstat><D:prop>${props.join("")}</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`;

export const notFound = (href: string) =>
  `<D:response><D:href>${xmlText(href)}</D:href><D:status>HTTP/1.1 404 Not Found</D:status></D:response>`;

/** `syncToken`: the collection's new token, for a sync-collection REPORT (RFC 6578 §6.4). */
export const multistatus = (responses: string[], syncToken?: string) =>
  new Response(
    `<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus ${NS}>${responses.join("")}${
      syncToken ? `<D:sync-token>${xmlText(syncToken)}</D:sync-token>` : ""
    }</D:multistatus>`,
    {
      status: 207,
      headers: { "content-type": 'application/xml; charset="utf-8"' },
    },
  );

/** A precondition that failed (RFC 4918 §16), e.g. `<D:valid-sync-token/>`, with its status. */
export const davError = (condition: string, status: 403 | 409) =>
  new Response(
    `<?xml version="1.0" encoding="utf-8"?><D:error xmlns:D="DAV:">${condition}</D:error>`,
    { status, headers: { "content-type": 'application/xml; charset="utf-8"' } },
  );

/** The kind of REPORT asked for: its root element without namespace. */
export const reportKind = (body: string): string =>
  body.match(/<(?:[\w-]+:)?(calendar-multiget|calendar-query|sync-collection)\b/)?.[1] ?? "";

/** The hrefs a calendar-multiget asks for. */
export const hrefsOf = (body: string): string[] =>
  [...body.matchAll(/<(?:[\w-]+:)?href>\s*([^<]+?)\s*<\/(?:[\w-]+:)?href>/g)].map((match) =>
    match[1]!.replace(/&amp;/g, "&"),
  );
