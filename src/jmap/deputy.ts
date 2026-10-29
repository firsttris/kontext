/**
 * The own mailbox folders, calendars and address books with their `shareWith`, read and written
 * in one request each (src/lib/deputy.ts decides what changes). Patches use the
 * `shareWith/<principal>` path, so a share someone set elsewhere in between stays.
 */
import type { DeputyKind, DeputyObjects, DeputyPatches, Shared } from "@/lib/deputy";
import { assertSetOk, CAPABILITIES, type JmapClient } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.calendars, CAPABILITIES.contacts];

const METHODS: Record<DeputyKind, { type: string; what: string }> = {
  mailbox: { type: "Mailbox", what: "Ordner" },
  calendar: { type: "Calendar", what: "Kalender" },
  addressBook: { type: "AddressBook", what: "Adressbuch" },
};

const KINDS = Object.keys(METHODS) as DeputyKind[];

export const loadDeputyObjects = async (
  client: JmapClient,
  accountId: string,
): Promise<DeputyObjects> => {
  const responses = await client.request(
    KINDS.map((kind) => [
      `${METHODS[kind].type}/get`,
      { accountId, properties: ["id", "shareWith"] },
      kind,
    ]),
    USING,
  );
  const listOf = (kind: DeputyKind): Shared[] =>
    (responses.find(([, , tag]) => tag === kind)?.[1].list as Shared[] | undefined) ?? [];
  return {
    mailbox: listOf("mailbox"),
    calendar: listOf("calendar"),
    addressBook: listOf("addressBook"),
  };
};

export const applyDeputyPatches = async (
  client: JmapClient,
  accountId: string,
  patches: DeputyPatches,
): Promise<void> => {
  const kinds = KINDS.filter((kind) => Object.keys(patches[kind]).length > 0);
  if (kinds.length === 0) return;
  const responses = await client.request(
    kinds.map((kind) => [`${METHODS[kind].type}/set`, { accountId, update: patches[kind] }, kind]),
    USING,
  );
  for (const [, result, tag] of responses) {
    assertSetOk(result, METHODS[tag as DeputyKind].what);
  }
};
