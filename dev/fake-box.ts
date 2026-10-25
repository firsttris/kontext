/**
 * A telephone box without a telephone, for development and the e2e tests: it pairs and talks to
 * Kontext exactly like the real one (box/agent), and a small HTTP control lets one ring it.
 *
 *   bun dev/fake-box.ts --url http://127.0.0.1:18090 --code K7QM-4XPA [--control 18096]
 *
 *   curl -XPOST localhost:18096/ring -d '{"from":"07223 123456"}'      # someone calls
 *   curl -XPOST localhost:18096/hangup -d '{"call":"…","cause":16}'    # the caller hangs up
 *   curl -XPOST localhost:18096/mailbox -d '{"call":"…","seconds":5}'  # leaves a message (silence)
 *   curl -XPOST localhost:18096/closed -d '{"from":"07223 123456"}'    # calls outside the hours
 *   curl localhost:18096/state                                         # what Kontext told the box
 *
 * Answered calls and dialled ones are "answered" at once; nobody talks, there is no audio.
 */
import { parseArgs } from "node:util";
import { createBoxFiles } from "../box/agent/files";
import { pair } from "../box/agent/link";
import type { PbxEvents } from "../box/agent/pbx";
import { runBox } from "../box/agent/run";
import type { BoxConfig, ToBox } from "../server/phone/protocol";
import { encodeWav } from "../server/phone/sounds";

const { values: args } = parseArgs({
  options: {
    url: { type: "string", default: "http://127.0.0.1:18090" },
    code: { type: "string" },
    control: { type: "string", default: "18096" },
  },
});
if (!args.code) throw new Error("--code fehlt (Einstellungen → Telefonie → Box koppeln)");

const commands: ToBox[] = [];
let config: BoxConfig | null = null;
let events: PbxEvents | null = null;
let counter = 0;
const now = () => new Date().toISOString();

const credentials = await pair(args.url, args.code);
const box = await runBox({
  credentials,
  version: "fake",
  makePbx: async (pbxEvents) => {
    events = pbxEvents;
    pbxEvents.onRegistration(true, "Registered");
    return {
      apply: async (next) => {
        config = next;
      },
      answer: async (call, room) => {
        commands.push({ type: "answer", call, room });
        pbxEvents.onCall({
          call,
          state: "answered",
          direction: "in",
          remote: "",
          local: "",
          at: now(),
        });
      },
      dial: async (call, room, number) => {
        commands.push({ type: "dial", call, room, number });
        pbxEvents.onCall({
          call,
          state: "ringing",
          direction: "out",
          remote: number,
          local: "",
          at: now(),
        });
        setTimeout(
          () =>
            pbxEvents.onCall({
              call,
              state: "answered",
              direction: "out",
              remote: number,
              local: "",
              at: now(),
            }),
          300,
        );
      },
      hangup: async (call) => {
        commands.push({ type: "hangup", call });
        pbxEvents.onCall({
          call,
          state: "ended",
          direction: "in",
          remote: "",
          local: "",
          cause: 16,
          at: now(),
        });
      },
    };
  },
});

Bun.serve({
  port: Number(args.control),
  fetch: async (request) => {
    const path = new URL(request.url).pathname;
    const body =
      request.method === "POST"
        ? ((await request.json().catch(() => ({}))) as Record<string, unknown>)
        : {};
    if (path === "/ring") {
      const call = String(body.call ?? `fake.${++counter}`);
      events?.onCall({
        call,
        state: "ringing",
        direction: "in",
        remote: String(body.from ?? ""),
        local: String(body.to ?? ""),
        at: now(),
      });
      return Response.json({ call });
    }
    if (path === "/hangup") {
      events?.onCall({
        call: String(body.call),
        state: "ended",
        direction: body.direction === "out" ? "out" : "in",
        remote: "",
        local: "",
        cause: Number(body.cause ?? 16),
        at: now(),
      });
      return Response.json({ ok: true });
    }
    if (path === "/closed") {
      // What Asterisk's opening-hours check does; the fake box does not look at the clock.
      const call = `fake.${++counter}`;
      events?.onCall({
        call,
        state: "closed",
        direction: "in",
        remote: String(body.from ?? ""),
        local: "",
        at: now(),
      });
      return Response.json({ call });
    }
    if (path === "/mailbox") {
      // As Asterisk does it: the mailbox picks up, the message goes up, then the call ends.
      const call = String(body.call);
      const seconds = Number(body.seconds ?? 5);
      events?.onCall({ call, state: "mailbox", direction: "in", remote: "", local: "", at: now() });
      const sent = await createBoxFiles({ credentials, soundDir: "/tmp" }).uploadVoicemail(
        call,
        encodeWav(new Int16Array(8000 * seconds)),
      );
      events?.onCall({
        call,
        state: "ended",
        direction: "in",
        remote: "",
        local: "",
        cause: 16,
        at: now(),
      });
      return Response.json({ sent });
    }
    if (path === "/state")
      return Response.json({ connected: box.state().connected, config, commands });
    return new Response("not found", { status: 404 });
  },
});
console.log(
  `Telefonbox (Attrappe) gekoppelt als ${credentials.boxId}, Steuerung auf ${args.control}`,
);
