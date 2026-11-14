/**
 * Which Stalwart edition runs: Community, or Enterprise with a valid license key. Both are the same
 * binary; the key alone switches the Enterprise features on (docs/server/enterprise.md of
 * stalwartlabs/website). Stalwart says which in `GET /api/account` (`edition`: "enterprise" with a
 * valid key, else "community"; "oss" for a build without the enterprise feature;
 * crates/http/src/auth/permissions.rs of stalwartlabs/stalwart v1.1.0). Kontext asks with its own
 * key, so the answer is the server's, not the person's. Enterprise-only parts of the app ask here
 * before they offer anything.
 */
import { authorizationFor } from "./management";

export type Edition = "community" | "enterprise" | "unknown";

/** Stalwart's word for the edition; anything else (an older Stalwart, an error) is unknown. */
export const editionOf = (body: unknown): Edition => {
  const edition = (body as { edition?: unknown } | null)?.edition;
  if (edition === "enterprise") return "enterprise";
  if (edition === "community" || edition === "oss") return "community";
  return "unknown";
};

/** A license is activated or lapses while Kontext runs: asked again after this long. */
export const EDITION_TTL_MS = 10 * 60_000;
/** After a failed question Stalwart is asked again sooner. */
export const EDITION_RETRY_MS = 60_000;

export type EditionCheck = () => Promise<Edition>;

export const createEditionCheck = ({
  stalwartUrl,
  key,
  fetch: fetchFn = fetch,
  now = Date.now,
}: {
  stalwartUrl: string;
  key: string;
  fetch?: typeof fetch;
  now?: () => number;
}): EditionCheck => {
  let cached: { edition: Edition; until: number } | null = null;
  const ask = async (): Promise<Edition> => {
    try {
      const response = await fetchFn(`${stalwartUrl}/api/account`, {
        headers: { authorization: authorizationFor(key) },
      });
      return response.ok ? editionOf(await response.json()) : "unknown";
    } catch {
      return "unknown";
    }
  };
  return async () => {
    if (cached && cached.until > now()) return cached.edition;
    const edition = await ask();
    cached = {
      edition,
      until: now() + (edition === "unknown" ? EDITION_RETRY_MS : EDITION_TTL_MS),
    };
    return edition;
  };
};

/** For every signed-in user: features such as restoring deleted mails depend on it. */
export const readEdition =
  ({
    currentEmail,
    edition,
  }: {
    currentEmail: (request: Request) => Promise<string | null>;
    edition?: EditionCheck;
  }) =>
  async (request: Request): Promise<{ edition: Edition } | null> =>
    (await currentEmail(request)) ? { edition: edition ? await edition() : "unknown" } : null;
