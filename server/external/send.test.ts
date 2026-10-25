import { describe, expect, it, vi } from "vitest";
import { createSealer } from "../crypto";
import { sendThrough } from "./send";
import type { Smtp } from "./smtp";
import type { ExternalAccount } from "./store";
import type { UserJmap } from "./user-jmap";

const raw = "From: Tristan <t@gmail.com>\r\nTo: a@x.de\r\nBcc: geheim@x.de\r\n\r\nHallo\r\n";

const setup = async (
  from = "T@Gmail.com",
  sendResult: Awaited<ReturnType<Smtp["send"]>> = { ok: true, refused: [] },
) => {
  const sealer = await createSealer("secret", "test");
  const account = {
    id: "e1",
    accountId: "acc",
    email: "t@gmail.com",
    login: "t@gmail.com",
    secret: await sealer.seal("app-pass"),
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
  } as ExternalAccount;
  const calls: unknown[][] = [];
  const jmap: UserJmap = {
    call: async <T>(list: unknown[]) => {
      calls.push(list);
      const [name] = list[0] as [string];
      if (name !== "Email/get") return [{} as T];
      return [
        {
          list: [
            {
              id: "m1",
              blobId: "b1",
              from: [{ name: "Tristan", email: from }],
              to: [{ name: null, email: "a@x.de" }],
              cc: null,
              bcc: [{ name: null, email: "geheim@x.de" }],
              mailboxIds: { drafts: true },
            },
          ],
        } as T,
      ];
    },
    download: async () => new Uint8Array(Buffer.from(raw, "binary")),
  };
  const send = vi.fn<Smtp["send"]>(async () => sendResult);
  const smtp: Smtp = { check: async () => ({ ok: true }), send };
  const request = { emailId: "m1", draftsId: "drafts", sentId: "sent" };
  return { run: () => sendThrough({ smtp, sealer, jmap }, account, request), send, calls };
};

describe("sendThrough", () => {
  it("sends through the provider without Bcc header and files the mail under Sent", async () => {
    const { run, send, calls } = await setup();
    expect(await run()).toEqual({ ok: true, refused: [] });
    const [endpoint, login, envelope, data] = send.mock.calls[0]!;
    expect(endpoint).toEqual({ host: "smtp.gmail.com", port: 465 });
    expect(login).toEqual({ user: "t@gmail.com", password: "app-pass" });
    expect(envelope).toEqual({ from: "t@gmail.com", to: ["a@x.de", "geheim@x.de"] });
    expect(Buffer.from(data).toString()).not.toContain("geheim");
    expect(JSON.stringify(calls[1])).toContain('"mailboxIds/sent":true');
  });

  it("refuses a mail that is not from the account's address", async () => {
    const { run, send } = await setup("jemand@firma.de");
    expect(await run()).toMatchObject({ ok: false, status: 400 });
    expect(send).not.toHaveBeenCalled();
  });

  it("keeps the draft when the provider refuses the login", async () => {
    const { run, calls } = await setup("t@gmail.com", {
      ok: false,
      error: { reason: "login", message: "nein" },
    });
    expect(await run()).toMatchObject({ ok: false, status: 502 });
    expect(calls).toHaveLength(1);
  });
});

describe("sendThrough with refused recipients", () => {
  it("files the mail under Sent and names the recipients the provider turned down", async () => {
    const { run, calls } = await setup("t@gmail.com", { ok: true, refused: ["geheim@x.de"] });
    expect(await run()).toEqual({ ok: true, refused: ["geheim@x.de"] });
    expect(JSON.stringify(calls[1])).toContain('"mailboxIds/sent":true');
  });
});
