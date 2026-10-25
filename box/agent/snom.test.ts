import { describe, expect, it } from "vitest";
import { macOfPath, snomSettings } from "./snom";

const desk = {
  id: "empfang",
  label: "Empfang & Büro",
  mac: "000413a1b2c3",
  extension: "21",
  password: "tisch-geheim",
  lines: ["kontext620"],
  outLine: null,
};

describe("Snom provisioning", () => {
  it("finds the phone by the MAC in the path, as Snom asks", () => {
    expect(macOfPath("/snom/000413A1B2C3.xml")).toBe("000413a1b2c3");
    expect(macOfPath("/snom/snom725-000413A1B2C3.htm")).toBe("000413a1b2c3");
    expect(macOfPath("/snom/../etc.xml")).toBeNull();
  });

  it("gives the phone its account at the box, in German", () => {
    const text = snomSettings(desk, "192.168.178.20", 5070);
    expect(text).toContain('<user_name idx="1" perm="RW">desk-empfang</user_name>');
    expect(text).toContain('<user_pass idx="1" perm="RW">tisch-geheim</user_pass>');
    expect(text).toContain('<user_host idx="1" perm="RW">192.168.178.20:5070</user_host>');
    expect(text).toContain('<user_realname idx="1" perm="RW">Empfang &amp; Büro</user_realname>');
    expect(text).toContain('<language perm="RW">Deutsch</language>');
  });
});
