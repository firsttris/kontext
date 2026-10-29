/**
 * Reading through what a search finds, page by page and oldest first, keeping only some: the
 * reports that come back for a sent mail (delivery reports, read receipts) hide among ordinary
 * mails, and Stalwart cannot search the parts that would tell them apart.
 */
import type { JmapClient } from "./client";

/** Mails per search page. */
export const PAGE = 50;

export type PageQuery = {
  filter: Record<string, unknown>;
  properties: string[];
  bodyProperties?: string[];
};

/** One page of the mails found, with the asked properties. */
const searchPage = async <T>(
  client: JmapClient,
  accountId: string,
  { filter, properties, bodyProperties }: PageQuery,
  position: number,
): Promise<T[]> => {
  const [, got] = await client.request([
    [
      "Email/query",
      {
        accountId,
        filter,
        sort: [{ property: "receivedAt", isAscending: true }],
        position,
        limit: PAGE,
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties,
        ...(bodyProperties ? { bodyProperties } : {}),
      },
      "g",
    ],
  ]);
  return (got![1] as { list?: T[] }).list ?? [];
};

/** The mails `keep` accepts among what the search finds, up to `pages` pages. */
export const searchPages = async <T>(
  client: JmapClient,
  accountId: string,
  query: PageQuery,
  keep: (mail: T) => boolean,
  pages: number,
  position = 0,
): Promise<T[]> => {
  const page = await searchPage<T>(client, accountId, query, position);
  const kept = page.filter(keep);
  return page.length < PAGE || pages <= 1
    ? kept
    : [...kept, ...(await searchPages(client, accountId, query, keep, pages - 1, position + PAGE))];
};
