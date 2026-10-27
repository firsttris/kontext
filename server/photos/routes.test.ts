// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionAccount } from "../categories/routes";
import { checkPhoto, isAccountId, MAX_PHOTO_BYTES } from "./photo";
import { createPhotoRoutes } from "./routes";
import { createPhotoStore } from "./store";

const jpeg = (size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
};

const account = (id: string): SessionAccount[] => [
  { id, isPersonal: true, isReadOnly: false },
  { id: "info", isPersonal: false, isReadOnly: false },
];

describe("profile photos", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("takes small JPEGs only, and plain account ids", () => {
    expect(checkPhoto(jpeg())).toEqual({ ok: true });
    expect(checkPhoto(new TextEncoder().encode("<svg></svg>")).ok).toBe(false);
    expect(checkPhoto(jpeg(MAX_PHOTO_BYTES + 1)).ok).toBe(false);
    expect(isAccountId("b")).toBe(true);
    expect(isAccountId("../db")).toBe(false);
    expect(isAccountId("")).toBe(false);
  });

  it("sets one's own photo, shows everyone's, and removes one's own", async () => {
    const dir = await mkdtemp(join(tmpdir(), "photos-"));
    dirs.push(dir);
    let who: SessionAccount[] | null = account("jonas");
    const app = createPhotoRoutes({ store: createPhotoStore(dir), accountsOf: async () => who });

    const put = await app.request("/", { method: "PUT", body: jpeg() });
    expect(put.status).toBe(200);
    const { photos } = (await put.json()) as { photos: Record<string, number> };
    expect(Object.keys(photos)).toEqual(["jonas"]);

    expect((await app.request("/", { method: "PUT", body: "nope" })).status).toBe(400);

    who = account("anna");
    const listed = (await (await app.request("/")).json()) as { photos: Record<string, number> };
    expect(listed.photos.jonas).toBe(photos.jonas);
    const photo = await app.request("/jonas");
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await photo.arrayBuffer())).toEqual(jpeg());
    expect((await app.request("/anna")).status).toBe(404);

    // Anna's DELETE removes only her own (none), not Jonas's.
    await app.request("/", { method: "DELETE" });
    expect((await app.request("/jonas")).status).toBe(200);
    who = account("jonas");
    await app.request("/", { method: "DELETE" });
    expect((await app.request("/jonas")).status).toBe(404);

    who = null;
    expect((await app.request("/")).status).toBe(401);
  });
});
