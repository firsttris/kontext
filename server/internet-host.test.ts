// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isInternetHost } from "./internet-host";

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
