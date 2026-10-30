import { describe, expect, it } from "vitest";
import { CORRESPONDENCE_HEADERS } from "./correspondence";
import { isAllowedHeaderForm } from "./header-form";
import { CHECK_HEADERS } from "./mail";

describe("isAllowedHeaderForm", () => {
  it("follows RFC 8621 §4.1.2", () => {
    expect(isAllowedHeaderForm("header:Received:all")).toBe(true);
    expect(isAllowedHeaderForm("header:Received:asText:all")).toBe(false);
    expect(isAllowedHeaderForm("header:Return-Path:asText")).toBe(false);
    expect(isAllowedHeaderForm("header:List-Unsubscribe:asURLs")).toBe(true);
    expect(isAllowedHeaderForm("header:list-unsubscribe:asText")).toBe(false);
    expect(isAllowedHeaderForm("header:From:asAddresses")).toBe(true);
    expect(isAllowedHeaderForm("header:From:asText")).toBe(false);
    expect(isAllowedHeaderForm("header:X-Spam-Score:asText:all")).toBe(true);
    expect(isAllowedHeaderForm("header:Content-Type")).toBe(true);
  });

  it("allows every header Kontext asks Stalwart for", () => {
    const asked = [...Object.values(CHECK_HEADERS), ...CORRESPONDENCE_HEADERS];
    expect(asked.filter((property) => !isAllowedHeaderForm(property))).toEqual([]);
  });
});
