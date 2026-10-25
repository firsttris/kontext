/**
 * LiveKit SIP, set up for the boxes: one inbound trunk that the boxes log in to (digest auth, any
 * number) and one dispatch rule that puts a call to "<uuid>" into the room "kontext-phone-<uuid>"
 * (dispatch_rule_callee). Made once and repaired on start when the password changed. Twirp JSON
 * as livekit-server-sdk sends it (dist/SipClient.js); LiveKit allows only one inbound trunk
 * without numbers, so it is replaced rather than added. Needs Redis behind LiveKit.
 */
import { type Fetch, type LiveKitConfig, twirpCall } from "../calls/livekit";
import { PHONE_ROOM_PREFIX } from "./phone";

export const TRUNK_NAME = "kontext-boxes";
export const TRUNK_USER = "kontext-box";
const RULE_NAME = "kontext-phone";

type Trunk = { sip_trunk_id: string; name: string; auth_username: string; auth_password: string };
type Rule = {
  sip_dispatch_rule_id: string;
  name: string;
  trunk_ids: string[];
  rule?: { dispatch_rule_callee?: { room_prefix?: string } };
};

const sip = <T>(
  config: LiveKitConfig,
  fetcher: Fetch,
  method: string,
  body: Record<string, unknown>,
) => twirpCall<T>(config, fetcher, "SIP", method, body, { sip: { admin: true } });

/** What has to change: nothing, or which old ones go and what is made. Pure. */
export const sipPlan = (
  trunks: Trunk[],
  rules: Rule[],
  password: string,
): { dropTrunks: string[]; makeTrunk: boolean; dropRules: string[]; keepTrunk: string | null } => {
  const ours = trunks.filter((trunk) => trunk.name === TRUNK_NAME);
  const good = ours.find(
    (trunk) => trunk.auth_username === TRUNK_USER && trunk.auth_password === password,
  );
  const dropTrunks = ours.filter((trunk) => trunk !== good).map((trunk) => trunk.sip_trunk_id);
  const ourRules = rules.filter((rule) => rule.name === RULE_NAME);
  const fits = (rule: Rule) =>
    Boolean(good) &&
    rule.trunk_ids.includes(good!.sip_trunk_id) &&
    rule.rule?.dispatch_rule_callee?.room_prefix === PHONE_ROOM_PREFIX;
  return {
    dropTrunks,
    makeTrunk: !good,
    dropRules: ourRules.filter((rule) => !fits(rule)).map((rule) => rule.sip_dispatch_rule_id),
    keepTrunk: good && ourRules.some(fits) ? good.sip_trunk_id : null,
  };
};

/** Makes LiveKit SIP take the boxes' calls; an error says why not (e.g. no Redis). */
export const ensureSipRouting = async (
  config: LiveKitConfig,
  password: string,
  fetcher: Fetch = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> => {
  try {
    const [{ items: trunks = [] }, { items: rules = [] }] = await Promise.all([
      sip<{ items?: Trunk[] }>(config, fetcher, "ListSIPInboundTrunk", {}),
      sip<{ items?: Rule[] }>(config, fetcher, "ListSIPDispatchRule", {}),
    ]);
    const plan = sipPlan(trunks, rules, password);
    if (plan.keepTrunk) return { ok: true };
    for (const id of plan.dropRules) {
      await sip(config, fetcher, "DeleteSIPDispatchRule", { sip_dispatch_rule_id: id });
    }
    for (const id of plan.dropTrunks) {
      await sip(config, fetcher, "DeleteSIPTrunk", { sip_trunk_id: id });
    }
    const trunkId = plan.makeTrunk
      ? (
          await sip<{ sip_trunk_id: string }>(config, fetcher, "CreateSIPInboundTrunk", {
            trunk: { name: TRUNK_NAME, auth_username: TRUNK_USER, auth_password: password },
          })
        ).sip_trunk_id
      : trunks.find(
          (trunk) => trunk.name === TRUNK_NAME && !plan.dropTrunks.includes(trunk.sip_trunk_id),
        )!.sip_trunk_id;
    await sip(config, fetcher, "CreateSIPDispatchRule", {
      rule: { dispatch_rule_callee: { room_prefix: PHONE_ROOM_PREFIX } },
      trunk_ids: [trunkId],
      name: RULE_NAME,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
};
