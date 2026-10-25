import { describe, expect, it } from "vitest";
import { signedOAuthQuery } from "./oauth-query";

describe("signedOAuthQuery", () => {
  it("is absent on a plain sign-in", () => {
    expect(signedOAuthQuery("")).toBeUndefined();
    expect(signedOAuthQuery("?redirect=%2Fmail")).toBeUndefined();
  });

  it("needs the names that were signed", () => {
    expect(signedOAuthQuery("?client_id=schreibzeug&sig=abc")).toBeUndefined();
  });

  it("keeps the signed parameters and drops the rest", () => {
    const search =
      "?client_id=schreibzeug&state=s1&redirect=%2Fmail&ba_param=ba_param&ba_param=client_id&ba_param=state&sig=abc";
    expect(new URLSearchParams(signedOAuthQuery(search))).toEqual(
      new URLSearchParams(
        "client_id=schreibzeug&state=s1&ba_param=ba_param&ba_param=client_id&ba_param=state&sig=abc",
      ),
    );
  });
});
