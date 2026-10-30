/**
 * Programs that signed in to the person's account at Stalwart with OAuth (x:OAuthGrant, new in
 * Stalwart 1.0; OAuthGrant in crates/registry/src/schema/structs.rs). Every user may list and end
 * their own (sysOAuthGrant* in crates/common/src/auth/permissions.rs). Ending one stops its access
 * and refresh tokens at once.
 */
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

const STALWART = [CAPABILITIES.core, CAPABILITIES.stalwart];

/** Kontext's own client: its grants are the sign-ins listed as browsers (server/access). */
const KONTEXT_CLIENT = "kontext";

export type OAuthGrant = {
  id: string;
  clientId: string;
  clientName: string | null;
  remoteIp: string | null;
  createdAt: string;
  lastUsedAt: string;
};

/**
 * The grants of other programs, the most recently used first; Kontext's own stay out. (`pending`
 * only marks a refresh token being rotated, crates/common/src/auth/oauth/grant.rs.) Pure.
 */
export const otherPrograms = (grants: OAuthGrant[]): OAuthGrant[] =>
  grants
    .filter((grant) => grant.clientId !== KONTEXT_CLIENT)
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));

export const listOAuthGrants = async (client: JmapClient): Promise<OAuthGrant[]> => {
  const { list } = await client.call<{ list: OAuthGrant[] }>(
    "x:OAuthGrant/get",
    {
      ids: null,
      properties: ["clientId", "clientName", "remoteIp", "createdAt", "lastUsedAt"],
    },
    STALWART,
  );
  return otherPrograms(list);
};

export const endOAuthGrant = async (client: JmapClient, id: string) =>
  assertSetOk(
    await client.call("x:OAuthGrant/set", { destroy: [id] }, STALWART),
    "Zugriff entziehen",
  );
