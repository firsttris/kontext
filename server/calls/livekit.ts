/**
 * Talking to LiveKit: join tokens for the browser, checking LiveKit's webhooks, and asking which
 * rooms have people in them (after a restart of the Kontext server). Tokens are HS256 JWTs with
 * the API key as issuer and the grants as claims, as livekit-server-sdk writes them
 * (dist/AccessToken.js, grants.js); a webhook carries such a JWT in "Authorization" with the
 * body's SHA-256 (dist/WebhookReceiver.js); its JSON names fields in camelCase. The room service
 * is Twirp with JSON (dist/RoomServiceClient.js: /twirp/livekit.RoomService/ListRooms,
 * ListParticipants), which answers in snake_case ("joined_at").
 */
import { jwtVerify, SignJWT } from "jose";
import type { RoomEvent } from "./calls";

export type LiveKitConfig = {
  /** How the Kontext server reaches LiveKit's API, e.g. http://livekit:7880. */
  url: string;
  apiKey: string;
  apiSecret: string;
};

type VideoGrant = {
  room?: string;
  roomJoin?: boolean;
  roomList?: boolean;
  roomAdmin?: boolean;
  canPublish?: boolean;
  canSubscribe?: boolean;
  canPublishData?: boolean;
};

/** A browser joins for this long; LiveKit renews the token itself while one stays connected. */
const JOIN_TTL = "10m";
const SERVER_TTL = "1m";
/** Clocks of the two servers may differ a little. */
const CLOCK_TOLERANCE_S = 10;

const secretOf = (config: LiveKitConfig) => new TextEncoder().encode(config.apiSecret);

const sign = (
  config: LiveKitConfig,
  claims: Record<string, unknown>,
  ttl: string,
  identity?: string,
) => {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(config.apiKey)
    .setExpirationTime(ttl)
    .setNotBefore(new Date());
  return (identity ? jwt.setSubject(identity) : jwt).sign(secretOf(config));
};

/** A browser's ticket into one room: talk, listen, share the screen, send reactions. */
export const joinToken = (
  config: LiveKitConfig,
  {
    identity,
    name,
    room,
    metadata,
  }: { identity: string; name: string; room: string; metadata: string },
) => {
  const video: VideoGrant = {
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  };
  return sign(config, { video, name, metadata }, JOIN_TTL, identity);
};

const base64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

/** The event of a webhook LiveKit really sent, or null for anything else. */
export const verifyWebhook = async (
  config: LiveKitConfig,
  body: string,
  authorization: string | null,
): Promise<RoomEvent | null> => {
  if (!authorization) return null;
  try {
    const { payload } = await jwtVerify(authorization.replace(/^Bearer /, ""), secretOf(config), {
      issuer: config.apiKey,
      clockTolerance: CLOCK_TOLERANCE_S,
      requiredClaims: ["exp"],
    });
    const hash = base64(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body)));
    if (payload.sha256 !== hash) return null;
    return JSON.parse(body) as RoomEvent;
  } catch {
    return null;
  }
};

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/** One call of LiveKit's API (Twirp, JSON), with a short token carrying just these claims. */
export const twirpCall = async <T>(
  config: LiveKitConfig,
  fetcher: Fetch,
  service: "RoomService" | "SIP",
  method: string,
  body: Record<string, unknown>,
  claims: { video?: VideoGrant; sip?: { admin?: boolean; call?: boolean } },
): Promise<T> => {
  const token = await sign(config, claims, SERVER_TTL);
  const response = await fetcher(`${config.url}/twirp/livekit.${service}/${method}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`LiveKit ${method}: ${response.status}`);
  return (await response.json()) as T;
};

const twirp = <T>(
  config: LiveKitConfig,
  fetcher: Fetch,
  method: string,
  body: Record<string, unknown>,
  video: VideoGrant,
) => twirpCall<T>(config, fetcher, "RoomService", method, body, { video });

/**
 * The rooms with people in them, as the webhooks would have told it: one participant_joined per
 * person, so the same code rebuilds the calls.
 */
export const currentRoomEvents = async (
  config: LiveKitConfig,
  fetcher: Fetch = fetch,
): Promise<RoomEvent[]> => {
  const { rooms = [] } = await twirp<{ rooms?: { name: string }[] }>(
    config,
    fetcher,
    "ListRooms",
    {},
    { roomList: true },
  );
  const perRoom = await Promise.all(
    rooms.map(async (room) => {
      const { participants = [] } = await twirp<{
        participants?: { identity: string; metadata?: string; joined_at?: string }[];
      }>(
        config,
        fetcher,
        "ListParticipants",
        { room: room.name },
        {
          roomAdmin: true,
          room: room.name,
        },
      );
      // The earliest first: they opened the call.
      return [...participants]
        .sort((a, b) => Number(a.joined_at ?? 0) - Number(b.joined_at ?? 0))
        .map(
          (participant): RoomEvent => ({
            event: "participant_joined",
            room: { name: room.name },
            participant: { identity: participant.identity, metadata: participant.metadata },
            createdAt: participant.joined_at,
          }),
        );
    }),
  );
  return perRoom.flat();
};
