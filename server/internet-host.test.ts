// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isInternetHost, pinHost } from "./internet-host";

const dns: Record<string, string[]> = {
  "imap.ionos.de": ["212.227.17.170"],
  stalwart: ["10.89.250.3"],
  "rebind.test": ["93.184.216.34", "127.0.0.1"],
};
const resolve = async (host: string) => dns[host] ?? [host];

describe("hosts on the internet", () => {
  it("are those that resolve to public addresses only", async () => {
    expect(await isInternetHost("imap.ionos.de", resolve)).toBe(true);
    expect(await isInternetHost("stalwart", resolve)).toBe(false);
    expect(await isInternetHost("rebind.test", resolve)).toBe(false);
    expect(await isInternetHost("169.254.169.254", resolve)).toBe(false);
    expect(await isInternetHost("[::1]", resolve)).toBe(false);
  });

  it("are not those that resolve to nothing", async () => {
    expect(
      await isInternetHost("gone.test", async () => Promise.reject(new Error("NXDOMAIN"))),
    ).toBe(false);
  });
});

describe("pinning a host", () => {
  it("gives the checked address to connect to, and the name for TLS", async () => {
    expect(await pinHost("imap.ionos.de", resolve)).toEqual({
      address: "212.227.17.170",
      servername: "imap.ionos.de",
    });
    expect(await pinHost("93.184.216.34", resolve)).toEqual({ address: "93.184.216.34" });
  });

  it("gives nothing for a host that points inside, even partly", async () => {
    expect(await pinHost("stalwart", resolve)).toBeNull();
    expect(await pinHost("rebind.test", resolve)).toBeNull();
  });
});
