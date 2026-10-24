/**
 * Sends a notification to every browser of some people. A subscription the push service no
 * longer knows (404, 410: permission withdrawn, app removed) is forgotten.
 */
import type { PushStore } from "./store";
import { type PushTarget, sendPush, type VapidKeys } from "./webpush";

/** What the service worker shows (src/sw/service-worker.ts). */
export type Notice = { title: string; body: string; url: string; tag: string };

export type Pusher = { notify: (memberIds: string[], notice: Notice) => Promise<void> };

export const createPusher = ({
  store,
  keys,
  subject,
  send = sendPush,
}: {
  store: PushStore;
  keys: VapidKeys;
  /** How the push services can reach the operator: the server's https address. */
  subject: string;
  send?: (
    target: PushTarget,
    message: Notice,
    keys: VapidKeys,
    subject: string,
  ) => Promise<{ status: number }>;
}): Pusher => ({
  notify: async (memberIds, notice) => {
    const targets = await store.targetsOf([...new Set(memberIds)]);
    await Promise.all(
      targets.map(async (target) => {
        try {
          const { status } = await send(target, notice, keys, subject);
          if (status === 404 || status === 410) await store.remove(target.endpoint);
        } catch {
          // Unreachable for now; the next message tries again.
        }
      }),
    );
  },
});
