/**
 * "In Karten öffnen" for an appointment's place: a plain link to the maps app, no map in Kontext.
 * On iPhone, iPad and Mac Apple Maps (developer.apple.com, "Map Links": `?q=`), elsewhere Google
 * Maps' search URL (developers.google.com/maps/documentation/urls, `api=1&query=`); both open the
 * app on a phone, where the route is one tap away. Pure.
 */

/**
 * A meeting link or any other web address in the "Ort" field is no place on a map, also next to a
 * room ("Konferenzraum 1; https://…", as Outlook joins its locations).
 */
const LOOKS_LIKE_ADDRESS_ON_THE_WEB =
  /(?:^|\s|[;,])(?:[a-z][a-z\d+.-]*:\/\/|www\.)|^\S+\.\S+\/\S*$/i;

export const isMapPlace = (location: string): boolean => {
  const text = location.trim();
  return text.length > 0 && !LOOKS_LIKE_ADDRESS_ON_THE_WEB.test(text);
};

/** iOS, iPadOS (which says "Macintosh") and macOS have Apple Maps. */
const hasAppleMaps = (userAgent: string): boolean => /iPhone|iPad|iPod|Macintosh/.test(userAgent);

/** The address that opens the place in the maps app, or null for a web address or nothing. */
export const mapsUrl = (location: string, userAgent: string): string | null => {
  if (!isMapPlace(location)) return null;
  const query = encodeURIComponent(location.trim());
  return hasAppleMaps(userAgent)
    ? `https://maps.apple.com/?q=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
};
