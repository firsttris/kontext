/**
 * Mail rules and the out-of-office reply of an account, stored together as Stalwart's Sieve script
 * and VacationResponse (server/rules/filters.ts explains why they belong together).
 */
import {
  type FilterAccess,
  type Filters,
  loadFilters,
  saveFilters,
} from "../../server/rules/filters";
import type { JmapClient } from "./client";

export type { Filters };

const accessOf = (client: JmapClient): FilterAccess => ({
  request: client.request,
  upload: async (accountId, script) =>
    (await client.upload(accountId, script, "application/sieve")).blobId,
  download: async (accountId, blobId) =>
    (await client.download(accountId, blobId, "regeln.sieve", "application/sieve")).text(),
});

export const getFilters = (client: JmapClient, accountId: string): Promise<Filters> =>
  loadFilters(accessOf(client), accountId);

export const setFilters = async (client: JmapClient, accountId: string, filters: Filters) => {
  const error = await saveFilters(accessOf(client), accountId, filters);
  if (error) throw new Error(error);
};
