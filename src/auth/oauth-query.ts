/**
 * Signing in for an OAuth client (Schreibzeug, an agent): Kontext's provider sends people without a
 * session to /login with the authorization request in the query, signed (`sig`, the signed names in
 * `ba_param`). The sign-in sends it back as `oauth_query`, and the server answers with the way on.
 * The same selection as `buildSignedOAuthQuery` in @better-auth/oauth-provider (src/signed-query.ts),
 * whose client plugin would do this for Better Auth's own client.
 */
const SIGNATURE = "sig";
const SIGNED_NAMES = "ba_param";

/** The signed part of a page's query, or undefined when the page was not opened for a sign-in. */
export const signedOAuthQuery = (search: string): string | undefined => {
  const params = new URLSearchParams(search);
  if (!params.has(SIGNATURE)) return undefined;
  const signed = new Set(params.getAll(SIGNED_NAMES));
  if (signed.size === 0) return undefined;
  const kept = new URLSearchParams();
  for (const [key, value] of params) {
    if (key === SIGNATURE || key === SIGNED_NAMES || signed.has(key)) kept.append(key, value);
  }
  return kept.toString();
};
