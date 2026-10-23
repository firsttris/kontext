import { describe, expect, it } from "vitest";
import { fromBase32, otpauthUrl, toBase32, totp, verifyTotp } from "./totp";

// RFC 6238, appendix B: the SHA-1 secret is the ASCII text "12345678901234567890".
const rfcSecret = toBase32(new TextEncoder().encode("12345678901234567890"));

describe("totp", () => {
  it("matches the RFC 6238 test vectors (last six digits)", async () => {
    expect(await totp(rfcSecret, 59_000)).toBe("287082");
    expect(await totp(rfcSecret, 1_111_111_109_000)).toBe("081804");
    expect(await totp(rfcSecret, 1_234_567_890_000)).toBe("005924");
  });

  it("accepts the neighbouring time steps only", async () => {
    const now = 1_234_567_890_000;
    expect(await verifyTotp(rfcSecret, await totp(rfcSecret, now - 30_000), now)).toBe(true);
    expect(await verifyTotp(rfcSecret, await totp(rfcSecret, now - 90_000), now)).toBe(false);
  });

  it("round-trips base32 and builds the otpauth URL", () => {
    expect(new TextDecoder().decode(fromBase32(rfcSecret))).toBe("12345678901234567890");
    expect(otpauthUrl("ABC", "max@weber.test")).toBe(
      "otpauth://totp/Sekret%C3%A4r:max%40weber.test?secret=ABC&issuer=Sekret%C3%A4r&algorithm=SHA1&digits=6&period=30",
    );
  });
});
