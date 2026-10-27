/**
 * A telephone box without a telephone, for development and the e2e tests: it pairs and talks to
 * Kontext exactly like the real one (box/agent), and a small HTTP control lets one ring it.
 *
 *   bun dev/fake-box.ts --url http://127.0.0.1:18090 --code K7QM-4XPA [--control 18097]
 *
 *   curl -XPOST localhost:18097/ring -d '{"from":"07223 123456"}'      # someone calls
 *   curl -XPOST localhost:18097/ring -d '{"from":"…","line":"anna620"}' # … a direct number
 *   curl -XPOST localhost:18097/hangup -d '{"call":"…","cause":16}'    # the caller hangs up
 *   curl -XPOST localhost:18097/mailbox -d '{"call":"…","seconds":5}'  # leaves a message (silence)
 *   curl -XPOST localhost:18097/closed -d '{"from":"07223 123456"}'    # calls outside the hours
 *   curl -XPOST localhost:18097/fax -d '{"from":"07223 123456"}'       # sends a fax
 *   curl -XPOST localhost:18097/event -d '{"call":"…","state":"answered","desk":"…"}'  # any step
 *   curl localhost:18097/state                                         # what Kontext told the box
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
    // Not 18096: dev/fake-schreibzeug.ts listens there, and both run next to `bun run dev`.
    control: { type: "string", default: "18097" },
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
      dial: async (call, room, number, line) => {
        commands.push({ type: "dial", call, room, number, ...(line ? { line } : {}) });
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
      doorOpen: async (call, code) => {
        commands.push({ type: "door-open", call, code });
        // Picked up, code sent, hung up.
        pbxEvents.onCall({
          call,
          state: "answered",
          direction: "in",
          remote: "",
          local: "",
          at: now(),
        });
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
      record: async (call, room) => {
        commands.push({ type: "record", call, room });
      },
      recordStop: async (call) => {
        commands.push({ type: "record-stop", call });
        // What MixMonitor would have written: three seconds of silence.
        await createBoxFiles({ credentials, soundDir: "/tmp" }).uploadRecording(
          call,
          encodeWav(new Int16Array(8000 * 3)),
        );
      },
      hold: async (call) => {
        commands.push({ type: "hold", call });
      },
      resume: async (call, room) => {
        commands.push({ type: "resume", call, room });
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
        ...(body.line ? { line: String(body.line) } : {}),
        ...(body.choice ? { choice: String(body.choice) } : {}),
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
    if (path === "/event") {
      // Anything the PBX may report, e.g. answered at a desk phone ({"desk":"…"}).
      events?.onCall({
        call: String(body.call ?? `fake.${++counter}`),
        state: body.state as "answered",
        direction: body.direction === "out" ? "out" : "in",
        remote: String(body.remote ?? ""),
        local: "",
        ...(body.desk ? { desk: String(body.desk) } : {}),
        at: now(),
      });
      return Response.json({ ok: true });
    }
    if (path === "/fax") {
      // A fax on the fax line: received, sent up as PDF, then the call ends.
      const call = `fake.${++counter}`;
      events?.onCall({
        call,
        state: "fax",
        direction: "in",
        remote: String(body.from ?? ""),
        local: "",
        at: now(),
      });
      const pdf = new TextEncoder().encode("%PDF-1.4\n% Kontext test fax\n%%EOF\n");
      const sent = await createBoxFiles({ credentials, soundDir: "/tmp" }).uploadFax(call, pdf);
      events?.onCall({
        call,
        state: "ended",
        direction: "in",
        remote: "",
        local: "",
        cause: 16,
        at: now(),
      });
      return Response.json({ call, sent });
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
