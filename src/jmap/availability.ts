/**
 * Colleagues' busy times: `Principal/getAvailability` (draft-ietf-jmap-calendars, "Principal
 * Availability"). Stalwart answers only from calendars the asking user may read the free/busy of
 * (`mayReadFreeBusy`), without titles, and leaves out events marked free, secret or cancelled
 * (crates/jmap/src/principal/availability.rs). A colleague who shares nothing looks free.
 */

import type { Busy, BusyStatus } from "@/lib/availability";
import { chunk } from "@/lib/chunk";
import { CAPABILITIES, type JmapClient } from "./client";

const USING = [CAPABILITIES.core, CAPABILITIES.principals, CAPABILITIES.availability];

/** Stalwart's `maxCallsInRequest`: one call per colleague, up to this many per request. */
const CALLS_PER_REQUEST = 16;

type BusyPeriod = { utcStart: string; utcEnd: string; busyStatus?: BusyStatus | null };

const utc = (date: Date) => date.toISOString().replace(/\.\d+Z$/, "Z");

/** The busy periods of each principal between two instants, by principal id. */
export const getAvailability = async (
  client: JmapClient,
  accountId: string,
  principalIds: string[],
  from: Date,
  to: Date,
): Promise<Record<string, Busy[]>> => {
  const result: Record<string, Busy[]> = {};
  for (const ids of chunk(principalIds, CALLS_PER_REQUEST)) {
    const responses = await client.request(
      ids.map((id) => [
        "Principal/getAvailability",
        { accountId, id, utcStart: utc(from), utcEnd: utc(to) },
        id,
      ]),
      USING,
    );
    for (const [, args, id] of responses) {
      result[id] = ((args.list as BusyPeriod[]) ?? []).map((period) => ({
        start: Date.parse(period.utcStart),
        end: Date.parse(period.utcEnd),
        status: period.busyStatus ?? "confirmed",
      }));
    }
  }
  return result;
};
