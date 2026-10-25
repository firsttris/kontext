// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Notice } from "../push/pusher";
import { createSecurePublicRoutes, createSecureRoutes } from "./routes";
import { codeFits, codeSchema, hashCode, stateOf } from "./secure";
import type { ReplyRow, SecureRow, SecureStore } from "./store";

describe("the code", () => {
  it("is checked without case and dashes, never stored as it is", () => {
    const { hash, salt } = hashCode("K7QP2MXR");
    expect(hash).not.toContain("K7QP");
    expect(codeFits(codeSchema.parse("k7qp-2mxr"), salt, hash)).toBe(true);
    expect(codeFits("K7QP2MXS", salt, hash)).toBe(false);
    expect(codeSchema.safeParse("123").success).toBe(false);
  });

  it("five wrong ones lock, the end of time expires", () => {
    const now = new Date("2026-10-25T10:00:00Z");
    expect(stateOf({ failedTries: 4, expiresAt: new Date("2026-11-01") }, now)).toBe("open");
    expect(stateOf({ failedTries: 5, expiresAt: new Date("2026-11-01") }, now)).toBe("locked");
    expect(stateOf({ failedTries: 0, expiresAt: new Date("2026-10-25T09:00:00Z") }, now)).toBe(
      "expired",
    );
  });
});

const memory = () => {
  const rows = new Map<string, SecureRow>();
  const content = new Map<string, string>();
  const replies: ReplyRow[] = [];
  const store = {
    get: async (id: string) => rows.get(id) ?? null,
    create: async (row: SecureRow, ciphertext: string) => {
      rows.set(row.id, { ...row, failedTries: 0, openedAt: null, openCount: 0 });
      content.set(row.id, ciphertext);
    },
    content: async (id: string) => content.get(id) ?? "",
    ofMember: async (member: string) =>
      [...rows.values()]
        .filter((row) => row.memberId === member)
        .map((row) => ({ ...row, replies: 0, unreadReplies: 0 })),
    replies: async (id: string) => replies.filter((reply) => reply.messageId === id),
    addReply: async (id: string, ciphertext: string) =>
      void replies.push({
        id: "r",
        messageId: id,
        ciphertext,
        createdAt: new Date(),
        readAt: null,
      }),
    markRepliesRead: async () => undefined,
    failed: async (id: string) => {
      rows.get(id)!.failedTries += 1;
    },
    opened: async (id: string, at: Date) => {
      const row = rows.get(id)!;
      row.failedTries = 0;
      row.openedAt ??= at;
      row.openCount += 1;
    },
    newCode: async (id: string, hash: string, salt: string) =>
      void Object.assign(rows.get(id)!, { codeHash: hash, codeSalt: salt, failedTries: 0 }),
    remove: async (id: string) => void rows.delete(id),
    pruneExpired: async () => 0,
  };
  return store as unknown as SecureStore;
};

const setup = () => {
  const store = memory();
  const told: Notice[] = [];
  let me = "jonas";
  const sender = createSecureRoutes({
    store,
    accountsOf: async () => [{ id: me, isPersonal: true, isReadOnly: false }],
  });
  const page = createSecurePublicRoutes({
    store,
    notify: async (_ids, notice) => void told.push(notice),
  });
  const json = (body: unknown) => ({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { sender, page, told, json, as: (who: string) => (me = who) };
};

describe("confidential messages", () => {
  it("opens only with the code, locks after five wrong ones, a new code opens again", async () => {
    const { sender, page, told, json, as } = setup();
    const created = await sender.request(
      "/",
      json({
        to: "petra@keller.test",
        fromName: "Jonas Weber",
        fromEmail: "jonas@weber.test",
        ciphertext: "iv-and-encrypted-content",
        senderKey: "-----BEGIN PGP MESSAGE-----\n…\n-----END PGP MESSAGE-----",
        code: "K7QP-2MXR",
        expiresDays: 30,
      }),
    );
    const { id } = (await created.json()) as { id: string };
    expect(created.status).toBe(201);

    const meta = (await (await page.request(`/${id}`)).json()) as {
      fromName: string;
      state: string;
    };
    expect(meta).toMatchObject({ fromName: "Jonas Weber", state: "open" });
    expect(JSON.stringify(meta)).not.toContain("encrypted-content");

    const right = await page.request(`/${id}/open`, json({ code: "k7qp 2mxr" }));
    expect(((await right.json()) as { ciphertext: string }).ciphertext).toBe(
      "iv-and-encrypted-content",
    );
    await page.request(`/${id}/open`, json({ code: "K7QP2MXR" }));
    expect(told.map((n) => n.title)).toEqual(["Vertrauliche Nachricht geöffnet"]);

    for (let i = 0; i < 4; i++) {
      expect((await page.request(`/${id}/open`, json({ code: "WRONGCODE" }))).status).toBe(403);
    }
    const last = await page.request(`/${id}/open`, json({ code: "WRONGCODE" }));
    expect(((await last.json()) as { left: number }).left).toBe(0);
    expect((await page.request(`/${id}/open`, json({ code: "K7QP2MXR" }))).status).toBe(423);

    // Only its sender sees it and gives a new code.
    as("anna");
    expect((await sender.request(`/${id}`)).status).toBe(404);
    as("jonas");
    await sender.request(`/${id}/code`, json({ code: "NEUERCODE1" }));
    expect((await page.request(`/${id}/open`, json({ code: "NEUERCODE1" }))).status).toBe(200);

    expect(
      (
        await page.request(
          `/${id}/reply`,
          json({ code: "NEUERCODE1", ciphertext: "encrypted-answer" }),
        )
      ).status,
    ).toBe(201);
    expect(told.at(-1)?.title).toBe("Antwort auf vertrauliche Nachricht");
    const mine = (await (await sender.request(`/${id}`)).json()) as {
      replies: { ciphertext: string }[];
    };
    expect(mine.replies[0]?.ciphertext).toBe("encrypted-answer");
  });
});
