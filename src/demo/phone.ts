/**
 * Telephony in the demo: the module as with a telephone box in the office, with the calls of the
 * last days – answered, missed with a message on the mailbox, dialled, the door. Nothing rings
 * and nobody can be dialled: that needs the box and LiveKit (docs/telephony.md). The statistics
 * are the server's own (server/phone/stats.ts). The message on the mailbox is a recording that
 * comes with the demo (voicemail.m4a: Piper's voice "kerstin", CC0).
 */
import type { PhoneCall } from "../../server/phone/phone";
import { callStats } from "../../server/phone/stats";
import { json } from "./respond";
import { type Store, visibleAccounts } from "./store";
import voicemail from "./voicemail.m4a?url";

const PEOPLE = ["jonas", "anna", "sandra", "max"];
const OFFICE = "+4972231000";

/** A call that ended `hoursAgo` hours ago, with what it was. */
const call = (
  id: string,
  hoursAgo: number,
  now: number,
  fields: Partial<PhoneCall> & Pick<PhoneCall, "direction" | "remote" | "outcome">,
): PhoneCall => {
  const started = new Date(now - hoursAgo * 3_600_000);
  const talked = fields.outcome === "answered";
  const minutes = talked ? 4 : 1;
  return {
    id,
    boxId: "demo",
    boxCallId: id,
    local: OFFICE,
    state: "ended",
    member: null,
    members: PEOPLE,
    room: null,
    startedAt: started.toISOString(),
    answeredAt: talked ? new Date(started.getTime() + 8_000).toISOString() : null,
    endedAt: new Date(started.getTime() + minutes * 60_000).toISOString(),
    note: "",
    callbackTaskId: null,
    voicemailSeconds: null,
    offeredTo: null,
    offeredBy: null,
    offeredJoin: false,
    held: false,
    present: [],
    forwardedTo: null,
    line: null,
    desk: null,
    topic: null,
    door: false,
    fax: null,
    recording: null,
    recordingSeconds: null,
    ...fields,
  };
};

/** The calls of Weber Haustechnik's last days; the numbers are the seed's contacts'. */
export const demoCalls = (now = Date.now()): PhoneCall[] => [
  call("p1", 0.5, now, {
    direction: "in",
    remote: "+491601234567",
    outcome: "missed",
    voicemailSeconds: 20,
    topic: "Kundendienst",
  }),
  call("p2", 2, now, {
    direction: "in",
    remote: "+49722381234",
    outcome: "answered",
    member: "anna",
    note: "Wartungsvertrag: Halle 2 mit aufnehmen, Angebot bis Freitag.",
  }),
  call("p3", 3, now, {
    direction: "out",
    remote: "+49721445566",
    outcome: "answered",
    member: "jonas",
    members: ["jonas"],
  }),
  call("p4", 5, now, {
    direction: "in",
    remote: "",
    outcome: "answered",
    member: "max",
    door: true,
  }),
  call("p5", 20, now, { direction: "in", remote: "+491717654321", outcome: "missed" }),
  call("p6", 26, now, {
    direction: "in",
    remote: "+49722355678",
    outcome: "answered",
    member: "jonas",
    desk: "Werkstatt",
  }),
  call("p7", 50, now, { direction: "in", remote: "+49722199887", outcome: "closed" }),
];

/** Who takes calls; the status each person set, "available" otherwise. */
type PhoneState = {
  calls: PhoneCall[];
  status: Map<string, { mode: string; until: string | null }>;
};

export const createPhone = (now = Date.now()): PhoneState => ({
  calls: demoCalls(now),
  status: new Map(),
});

const NO_BOX =
  "In der Demo ist keine Telefonbox angeschlossen: Wählen geht nur in Kontext mit Telefonie.";

/** /api/phone for whoever is signed in; null for a path that is not the phone's. */
export const handlePhone = async (
  store: Store,
  phone: PhoneState,
  request: Request,
  path: string,
): Promise<Response | null> => {
  const me = visibleAccounts(store)[0]?.id;
  if (!me) return json({ error: "Nicht angemeldet" }, 401);
  const route = `${request.method} ${path}`;
  const mine = phone.calls.filter((c) => c.members.includes(me) || c.member === me);
  if (route === "GET /api/phone") {
    return json({
      enabled: true,
      allowed: true,
      online: true,
      colleagues: PEOPLE.filter((id) => id !== me),
      ringPlan: { mode: "all", stepSeconds: 15, order: PEOPLE },
      recordingEnabled: false,
      busy: [],
      unavailable: [...phone.status].filter(([, s]) => s.mode !== "available").map(([id]) => id),
      status: phone.status.get(me) ?? { mode: "available", until: null },
      calls: mine,
    });
  }
  if (route === "GET /api/phone/stats") {
    const days = Number(new URL(request.url).searchParams.get("days") ?? 30) || 30;
    return json(callStats(mine, new Date(), days));
  }
  if (route === "PUT /api/phone/status") {
    phone.status.set(me, (await request.json()) as { mode: string; until: string | null });
    return new Response(null, { status: 204 });
  }
  const note = route.match(/^PUT \/api\/phone\/calls\/([^/]+)\/note$/);
  if (note) {
    const found = phone.calls.find((c) => c.id === decodeURIComponent(note[1]!));
    if (!found) return json({ error: "Unbekannt" }, 404);
    found.note = ((await request.json()) as { note: string }).note;
    return json({ call: found });
  }
  const message = route.match(/^GET \/api\/phone\/calls\/([^/]+)\/voicemail$/);
  if (message) {
    const found = mine.find((c) => c.id === decodeURIComponent(message[1]!));
    if (!found?.voicemailSeconds) return json({ error: "Unbekannt" }, 404);
    return fetch(voicemail);
  }
  if (route === "POST /api/phone/block") return json({ ok: true });
  if (request.method === "POST") return json({ error: NO_BOX }, 409);
  return null;
};
