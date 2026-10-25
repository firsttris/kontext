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
import type { ImportResult } from "../jmap-server";
import type { Hub } from "../live/hub";
import { createPhoneAdminRoutes } from "./admin-routes";
import { createPhoneSoundRoutes } from "./admin-sounds";
import { createBoxFileRoutes } from "./box-routes";
import { createFaxes } from "./fax";
import { createPhoneFiles } from "./files";
import { ensureSipRouting } from "./livekit-sip";
import { type phoneNotice, roomOfPhoneRoom } from "./phone";
import { createRecordings } from "./recordings";
import { createPhoneRoutes } from "./routes";
import { type CallbackTasks, createPhoneService } from "./service";
import { createPhoneStore } from "./store";
import { createVoicemail } from "./voicemail";

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
  tasks?: CallbackTasks;
  /** Where greetings and messages are kept, next to the database. */
  dir: string;
  /** Puts a mail into a mailbox (server/jmap-server.ts). */
  importMessage: (accountId: string, message: Uint8Array) => Promise<ImportResult>;
};

/** Bun's WebSocket for the boxes; Bun.serve needs `websocket` (server/main.ts). */
const { websocket, upgradeWebSocket } = createBunWebSocket();

export { websocket };

export const createPhone = (setup: PhoneSetup) => {
  const store = createPhoneStore(setup.db, setup.sealer);
  const files = createPhoneFiles(setup.dir);
  const ensureSip = (password: string) => ensureSipRouting(setup.livekit, password);
  const service = createPhoneService({
    store,
    hub: setup.hub,
    trunkHost: setup.trunkHost,
    trunkPort: setup.trunkPort,
    notify: setup.notify,
    tasks: setup.tasks,
    ensureSip,
  });
  // LiveKit SIP may still be starting; a failure shows in the Firmenverwaltung.
  void service.reconfigure().catch(() => undefined);
  // Closed days that passed leave the box's configuration (Asterisk would repeat them yearly).
  setInterval(() => void service.reconfigure().catch(() => undefined), 86_400_000).unref();
  const voicemail = createVoicemail({
    store,
    files,
    refresh: service.refresh,
    importMessage: setup.importMessage,
  });

  return {
    routes: createPhoneRoutes({
      service,
      store,
      livekit: setup.livekit,
      publicUrl: setup.publicUrl,
      viewerOf: setup.viewerOf,
      nameOf: setup.nameOf,
      upgradeWebSocket,
      boxFiles: createBoxFileRoutes({
        store,
        files,
        voicemail,
        recordings: createRecordings({ store, files, refresh: service.refresh }),
        faxes: createFaxes({
          store,
          files,
          refresh: service.refresh,
          importMessage: setup.importMessage,
        }),
      }),
      files,
    }),
    adminRoutes: createPhoneAdminRoutes({
      store,
      service,
      sipStatus: async () => ensureSip((await store.settings()).trunkPassword),
      sounds: createPhoneSoundRoutes({ store, service, files }),
    }),
    /** LiveKit's room events: who is in a phone room decides when its lines end. */
    onRoomEvent: (event: RoomEvent) => {
      const room = roomOfPhoneRoom(event.room?.name ?? "");
      const identity = event.participant?.identity;
      if (!room || !identity) return;
      if (event.event === "participant_joined") {
        void service.joinedRoom(room, identity).catch(() => undefined);
      }
      if (event.event === "participant_left") {
        void service.leftRoom(room, identity).catch(() => undefined);
      }
    },
  };
};

export type Phone = ReturnType<typeof createPhone>;
