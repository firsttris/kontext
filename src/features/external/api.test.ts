import { afterEach, describe, expect, it, vi } from "vitest";
import type { Identity } from "@/jmap/types";
import {
  type ExternalAccount,
  externalIdentity,
  externalIdOf,
  listExternalAccounts,
  replyingExternal,
} from "./api";

const own: Identity = {
  id: "i1",
  name: "Jonas Weber",
  email: "jonas@weber-haustechnik.test",
  replyTo: null,
  bcc: null,
  textSignature: "Gruß Jonas",
  htmlSignature: "<p>Gruß Jonas</p>",
};

describe("externalIdentity", () => {
  it("offers the external address as a sender with the own signature", () => {
    const account = { id: "e1", name: "Jonas", email: "jonas@gmail.com" } as ExternalAccount;
    const identity = externalIdentity(account, own);
    expect(identity).toMatchObject({
      name: "Jonas",
      email: "jonas@gmail.com",
      htmlSignature: "<p>Gruß Jonas</p>",
    });
    expect(externalIdOf(identity)).toBe("e1");
    expect(externalIdOf(own)).toBeNull();
  });
});

describe("replyingExternal", () => {
  const gmail = externalIdentity({
    id: "e1",
    name: "Jonas",
    email: "jonas@gmail.com",
  } as ExternalAccount);

  it("answers as the other mailbox the mail was sent to", () => {
    expect(replyingExternal([own, gmail], { to: [{ email: "Jonas@Gmail.com" }], cc: null })).toBe(
      gmail,
    );
    expect(replyingExternal([own, gmail], { to: [], cc: [{ email: "jonas@gmail.com" }] })).toBe(
      gmail,
    );
  });

  it("leaves mail to the own address to the usual choice", () => {
    expect(replyingExternal([own, gmail], { to: [{ email: own.email }] })).toBeNull();
  });
});

describe("listExternalAccounts", () => {
  const answer = (status: number, body: string, type: string) =>
    vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(body, { status, headers: { "content-type": type } }));
  afterEach(() => vi.restoreAllMocks());

  it("is null where the server does not offer it (no route, or the app's index.html)", async () => {
    answer(404, "{}", "application/json");
    expect(await listExternalAccounts()).toBeNull();
    answer(200, "<!doctype html>", "text/html; charset=utf-8");
    expect(await listExternalAccounts()).toBeNull();
  });

  it("lists the accounts", async () => {
    answer(200, '[{"id":"e1"}]', "application/json");
    expect(await listExternalAccounts()).toEqual([{ id: "e1" }]);
  });
});
