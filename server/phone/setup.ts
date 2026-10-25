/**
 * Telephony wired into the server: its store, the service, the routes for people and boxes, and
 * the Firmenverwaltung's part. Only with LiveKit (the calls run in its rooms through LiveKit SIP).
 */
import { createBunWebSocket } from "hono/bun";
import type { RoomEvent } from "../calls/calls";
import type { LiveKitConfig } from "../calls/livekit";
import type { Viewer } from "../chat/chat";
import type { Sealer } from "../crypto";
import type { Db } from "../db";
import type { Hub } from "../live/hub";
import { createPhoneAdminRoutes } from "./admin-routes";
import { ensureSipRouting } from "./livekit-sip";
import { type phoneNotice, roomOfPhoneRoom } from "./phone";
import { createPhoneRoutes } from "./routes";
import { createPhoneService } from "./service";
import { createPhoneStore } from "./store";

export type PhoneSetup = {
  db: Db;
  sealer: Sealer;
  hub: Hub;
  livekit: LiveKitConfig;
  publicUrl: string | null;
  trunkHost: string;
  trunkPort: number;
  viewerOf: (request: Request) => Promise<Viewer | null>;
  nameOf: (request: Request) => Promise<string>;
  notify?: (members: string[], notice: ReturnType<typeof phoneNotice>) => Promise<void>;
};

/** Bun's WebSocket for the boxes; Bun.serve needs `websocket` (server/main.ts). */
const { websocket, upgradeWebSocket } = createBunWebSocket();

export { websocket };

export const createPhone = (setup: PhoneSetup) => {
  const store = createPhoneStore(setup.db, setup.sealer);
  const ensureSip = (password: string) => ensureSipRouting(setup.livekit, password);
  const service = createPhoneService({
    store,
    hub: setup.hub,
    trunkHost: setup.trunkHost,
    trunkPort: setup.trunkPort,
    notify: setup.notify,
    ensureSip,
  });
  // LiveKit SIP may still be starting; a failure shows in the Firmenverwaltung.
  void service.reconfigure().catch(() => undefined);

  return {
    routes: createPhoneRoutes({
      service,
      store,
      livekit: setup.livekit,
      publicUrl: setup.publicUrl,
      viewerOf: setup.viewerOf,
      nameOf: setup.nameOf,
      upgradeWebSocket,
    }),
    adminRoutes: createPhoneAdminRoutes({
      store,
      service,
      sipStatus: async () => ensureSip((await store.settings()).trunkPassword),
    }),
    /** LiveKit's room events: whoever had a phone call left its room, so it ends. */
    onRoomEvent: (event: RoomEvent) => {
      const room = roomOfPhoneRoom(event.room?.name ?? "");
      const identity = event.participant?.identity;
      if (room && identity && event.event === "participant_left") {
        void service.leftRoom(room, identity).catch(() => undefined);
      }
    },
  };
};

export type Phone = ReturnType<typeof createPhone>;
