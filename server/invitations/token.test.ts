// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createRsvpTokens } from "./token";

const SECRET = "a-secret-of-at-least-thirty-two-characters";
const claim = {
  accountId: "d",
  eventId: "i",
  uid: "195d325d-b502",
  email: "Markus@Hoffmann.test",
  expiresAt: new Date("2027-01-01T00:00:00Z"),
};

describe("rsvp tokens", () => {
  it("signs a claim and reads it back, the address in lower case", async () => {
    const tokens = await createRsvpTokens(SECRET);
    const token = await tokens.sign(claim);
    expect(token).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(await tokens.verify(token, new Date("2026-11-01T00:00:00Z"))).toEqual({
      ...claim,
      email: "markus@hoffmann.test",
    });
  });

  it("refuses a token past its time", async () => {
    const tokens = await createRsvpTokens(SECRET);
    const token = await tokens.sign(claim);
    expect(await tokens.verify(token, new Date("2027-01-01T00:00:00Z"))).toBeNull();
  });

  it("refuses a changed claim, another secret and broken tokens", async () => {
    const tokens = await createRsvpTokens(SECRET);
    const [body, mac] = (await tokens.sign(claim)).split(".");
    const other = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), m: "x@y.test" }),
    ).toString("base64url");
    expect(await tokens.verify(`${other}.${mac}`)).toBeNull();
    const elsewhere = await createRsvpTokens(`${SECRET}-other`);
    expect(await elsewhere.verify(`${body}.${mac}`)).toBeNull();
    for (const broken of ["", "abc", `${body}.`, `${body}.${mac}.x`, "e30.AAAA"]) {
      expect(await tokens.verify(broken)).toBeNull();
    }
  });
});
