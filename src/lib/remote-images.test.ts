import { describe, expect, it } from "vitest";
import { imageState } from "./remote-images";

const header = (dmarc: string) => [
  `mx.weber.test; dmarc=${dmarc} header.from=shop.example; spf=${dmarc} smtp.mailfrom=shop.example`,
];

describe("pictures from the internet", () => {
  it("load at once only for a trusted sender that is confirmed", () => {
    expect(imageState(true, "news@shop.example", header("pass"))).toBe("load");
    expect(imageState(true, "news@shop.example", header("fail"))).toBe("unconfirmed");
    expect(imageState(false, "news@shop.example", header("pass"))).toBe("ask");
  });

  it("a mail without any check (imported, from inside) counts as the sender's", () => {
    expect(imageState(true, "news@shop.example", null)).toBe("load");
  });
});
