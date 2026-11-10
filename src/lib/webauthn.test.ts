import { describe, expect, it } from "vitest";
import {
  assertionJson,
  creationOptions,
  fromBase64url,
  isCancelled,
  registrationJson,
  requestOptions,
  toBase64url,
} from "./webauthn";

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

describe("base64url", () => {
  it("goes there and back without padding, with - and _", () => {
    const data = new Uint8Array([251, 255, 0, 1, 2]);
    const text = toBase64url(data);
    expect(text).toBe("-_8AAQI");
    expect([...fromBase64url(text)]).toEqual([...data]);
  });

  it("encodes a view into a larger buffer only over its own bytes", () => {
    const view = new Uint8Array([9, 1, 2, 9]).subarray(1, 3);
    expect(toBase64url(view)).toBe(toBase64url(new Uint8Array([1, 2])));
  });
});

describe("signing in", () => {
  it("asks for any passkey of the relying party, with the user verified", () => {
    const options = requestOptions({
      challenge: "AQID",
      rpId: "kontext.firma.de",
      timeout: 300000,
    });
    expect([...new Uint8Array(options.challenge as ArrayBuffer)]).toEqual([1, 2, 3]);
    expect(options).toMatchObject({ rpId: "kontext.firma.de", userVerification: "required" });
    expect(options.allowCredentials).toBeUndefined();
  });

  it("hands the answer on as Stalwart's PasskeyAssertion", () => {
    const credential = {
      rawId: bytes(1),
      response: {
        clientDataJSON: bytes(2),
        authenticatorData: bytes(3),
        signature: bytes(4),
        userHandle: bytes(0, 0, 0, 7),
      },
    } as unknown as PublicKeyCredential;
    expect(assertionJson(credential)).toEqual({
      rawId: "AQ",
      response: {
        clientDataJSON: "Ag",
        authenticatorData: "Aw",
        signature: "BA",
        userHandle: "AAAABw",
      },
    });
  });

  it("leaves out a missing user handle", () => {
    const credential = {
      rawId: bytes(1),
      response: {
        clientDataJSON: bytes(2),
        authenticatorData: bytes(3),
        signature: bytes(4),
        userHandle: null,
      },
    } as unknown as PublicKeyCredential;
    expect(assertionJson(credential).response).not.toHaveProperty("userHandle");
  });
});

describe("a new passkey", () => {
  const json = {
    rp: { id: "kontext.firma.de", name: "kontext.firma.de" },
    user: { id: "AAAABw", name: "jonas@firma.de", displayName: "Jonas Weber" },
    challenge: "AQID",
    pubKeyCredParams: [{ type: "public-key" as const, alg: -7 }],
    timeout: 300000,
    excludeCredentials: [{ type: "public-key" as const, id: "BA" }],
    authenticatorSelection: {
      residentKey: "required" as const,
      userVerification: "required" as const,
    },
    attestation: "none" as const,
  };

  it("turns Stalwart's strings into the browser's buffers", () => {
    const options = creationOptions(json);
    expect([...new Uint8Array(options.user.id as ArrayBuffer)]).toEqual([0, 0, 0, 7]);
    expect([...new Uint8Array(options.challenge as ArrayBuffer)]).toEqual([1, 2, 3]);
    expect([...new Uint8Array(options.excludeCredentials![0]!.id as ArrayBuffer)]).toEqual([4]);
    expect(options).toMatchObject({
      rp: json.rp,
      attestation: "none",
      pubKeyCredParams: json.pubKeyCredParams,
    });
  });

  it("hands the browser's answer on as x:Passkey's registration", () => {
    const credential = {
      response: { clientDataJSON: bytes(1), attestationObject: bytes(2) },
    } as unknown as PublicKeyCredential;
    expect(registrationJson(credential)).toEqual({ clientDataJson: "AQ", attestationObject: "Ag" });
  });
});

describe("a closed dialog", () => {
  it("counts as cancelled, other errors do not", () => {
    expect(isCancelled(new DOMException("no", "NotAllowedError"))).toBe(true);
    expect(isCancelled(new DOMException("no", "InvalidStateError"))).toBe(false);
    expect(isCancelled(new Error("x"))).toBe(false);
  });
});
