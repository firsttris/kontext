import { describe, expect, it } from "vitest";
import type { BoxConfig } from "../../server/phone/protocol";
import { withIpv4Registrar } from "./registrar";

const config = (registrar: string) =>
  ({ line: { registrar, username: "kontext620", password: "geheim" } }) as BoxConfig;

describe("withIpv4Registrar", () => {
  it("puts the IPv4 address in place of the Fritzbox's name", async () => {
    const resolved = await withIpv4Registrar(config("fritz.box"), async () => "192.168.178.1");
    expect(resolved.line?.registrar).toBe("192.168.178.1");
    expect(resolved.line?.username).toBe("kontext620");
  });

  it("leaves an address as it is, without a lookup", async () => {
    const lookup = async () => {
      throw new Error("no lookup expected");
    };
    expect((await withIpv4Registrar(config("192.168.178.1"), lookup)).line?.registrar).toBe(
      "192.168.178.1",
    );
  });

  it("keeps the name when it does not resolve", async () => {
    const resolved = await withIpv4Registrar(config("fritz.box"), () =>
      Promise.reject(new Error("ENOTFOUND")),
    );
    expect(resolved.line?.registrar).toBe("fritz.box");
  });

  it("leaves a configuration without a line alone", async () => {
    const none = { line: null } as BoxConfig;
    expect(await withIpv4Registrar(none, async () => "1.2.3.4")).toBe(none);
  });
});
