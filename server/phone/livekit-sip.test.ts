// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { LiveKitConfig } from "../calls/livekit";
import { ensureSipRouting, sipPlan, TRUNK_NAME, TRUNK_USER } from "./livekit-sip";

const livekit: LiveKitConfig = {
  url: "http://livekit.test",
  apiKey: "kontext",
  apiSecret: "a-test-secret-that-is-long-enough-0123",
};

const trunk = (id: string, password = "pw", name = TRUNK_NAME) => ({
  sip_trunk_id: id,
  name,
  auth_username: TRUNK_USER,
  auth_password: password,
});
const rule = (id: string, trunkIds: string[], prefix = "kontext-phone-") => ({
  sip_dispatch_rule_id: id,
  name: "kontext-phone",
  trunk_ids: trunkIds,
  rule: { dispatch_rule_callee: { room_prefix: prefix } },
});

describe("sipPlan", () => {
  it("changes nothing when trunk and rule fit", () => {
    expect(sipPlan([trunk("t1")], [rule("r1", ["t1"])], "pw")).toEqual({
      dropTrunks: [],
      makeTrunk: false,
      dropRules: [],
      keepTrunk: "t1",
    });
  });

  it("replaces a trunk with an old password and its rule", () => {
    expect(sipPlan([trunk("t1", "old")], [rule("r1", ["t1"])], "pw")).toEqual({
      dropTrunks: ["t1"],
      makeTrunk: true,
      dropRules: ["r1"],
      keepTrunk: null,
    });
  });

  it("adds the missing rule and leaves other trunks alone", () => {
    expect(sipPlan([trunk("t1"), trunk("x", "pw", "other")], [], "pw")).toEqual({
      dropTrunks: [],
      makeTrunk: false,
      dropRules: [],
      keepTrunk: null,
    });
  });
});

describe("ensureSipRouting", () => {
  it("makes trunk and rule on a fresh LiveKit, as SIP admin", async () => {
    const asked: { method: string; body: unknown }[] = [];
    const fetcher = async (input: string, init?: RequestInit) => {
      const method = new URL(input).pathname.split("/").at(-1)!;
      asked.push({ method, body: JSON.parse(String(init?.body)) });
      if (method.startsWith("List")) return Response.json({ items: [] });
      if (method === "CreateSIPInboundTrunk") return Response.json({ sip_trunk_id: "ST_1" });
      return Response.json({});
    };
    expect(await ensureSipRouting(livekit, "secret", fetcher)).toEqual({ ok: true });
    expect(asked.map((a) => a.method).sort()).toEqual([
      "CreateSIPDispatchRule",
      "CreateSIPInboundTrunk",
      "ListSIPDispatchRule",
      "ListSIPInboundTrunk",
    ]);
    expect(asked.find((a) => a.method === "CreateSIPInboundTrunk")?.body).toEqual({
      trunk: { name: TRUNK_NAME, auth_username: TRUNK_USER, auth_password: "secret" },
    });
    expect(asked.find((a) => a.method === "CreateSIPDispatchRule")?.body).toEqual({
      rule: { dispatch_rule_callee: { room_prefix: "kontext-phone-" } },
      trunk_ids: ["ST_1"],
      name: "kontext-phone",
    });
  });

  it("says why when LiveKit has no SIP (no Redis)", async () => {
    const fetcher = async () => new Response("sip not connected", { status: 500 });
    expect(await ensureSipRouting(livekit, "secret", fetcher)).toEqual({
      ok: false,
      error: expect.stringMatching(/^LiveKit ListSIP\w+: 500$/),
    });
  });
});
