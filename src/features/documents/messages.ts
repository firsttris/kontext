/**
 * Kontext and Schreibzeug in its frame talk with `postMessage`, only with each other: a message
 * counts only from the frame's window at Schreibzeug's origin, and goes only to that origin.
 * Schreibzeug keeps the same shapes on its side (apps/web/src/embed/messages.ts in
 * firsttris/schreibzeug).
 */
import { z } from "zod";

/** Where the module lives in Kontext; the rest of the path is Schreibzeug's own. */
export const DOCUMENTS_PATH = "/documents";

/** What Kontext tells Schreibzeug. */
export type FrameCommand =
  | { source: "kontext"; type: "theme"; theme: "light" | "dark" }
  | { source: "kontext"; type: "navigate"; path: string }
  | { source: "kontext"; type: "logout" };

const frameMessageSchema = z.discriminatedUnion("type", [
  z.object({ source: z.literal("schreibzeug"), type: z.literal("ready") }),
  z.object({ source: z.literal("schreibzeug"), type: z.literal("route"), path: z.string() }),
  z.object({
    source: z.literal("schreibzeug"),
    type: z.literal("title"),
    title: z.string().nullable(),
  }),
  z.object({ source: z.literal("schreibzeug"), type: z.literal("unsaved"), unsaved: z.boolean() }),
  z.object({ source: z.literal("schreibzeug"), type: z.literal("shortcut"), key: z.string() }),
  z.object({ source: z.literal("schreibzeug"), type: z.literal("signed-out") }),
]);

export type FrameMessage = z.infer<typeof frameMessageSchema>;

/** A message from Schreibzeug's frame, or null for anything else. */
export const readFrameMessage = (
  event: { origin: string; source: unknown; data: unknown },
  expected: { origin: string; frame: unknown },
): FrameMessage | null => {
  if (event.origin !== expected.origin || event.source !== expected.frame) return null;
  const parsed = frameMessageSchema.safeParse(event.data);
  return parsed.success ? parsed.data : null;
};

/** Schreibzeug's page for a path of Kontext: `/documents/edit/1` → `/edit/1`. */
export const framePathOf = (kontextPath: string): string => {
  const rest = kontextPath.startsWith(DOCUMENTS_PATH)
    ? kontextPath.slice(DOCUMENTS_PATH.length)
    : "";
  return rest.startsWith("/") && !rest.startsWith("//") ? rest : "/";
};

/** The rest of Kontext's path for a page of Schreibzeug (the route's splat): `/edit/1?x` → `edit/1`. */
export const splatOf = (framePath: string): string =>
  new URL(framePath, "http://frame.invalid").pathname.replace(/^\/+/, "");

/** Kontext's path for a page of Schreibzeug: `/edit/1?x` → `/documents/edit/1`. */
export const kontextPathOf = (framePath: string): string => {
  const splat = splatOf(framePath);
  return splat ? `${DOCUMENTS_PATH}/${splat}` : DOCUMENTS_PATH;
};

/** The frame's first address: the page, with the parameter that makes Schreibzeug embedded. */
export const frameSrcOf = (schreibzeugUrl: string, framePath: string): string => {
  const url = new URL(framePath, schreibzeugUrl);
  url.searchParams.set("embedded", "kontext");
  return url.toString();
};
