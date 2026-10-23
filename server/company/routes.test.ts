import { describe, expect, it } from "vitest";
import { type Roles, rolesValue, type StalwartAccount } from "./accounts";
import type { Management } from "./management";
import { createCompanyRoutes } from "./routes";

const roles: Roles = { userRoleIds: ["b"], companyRoleId: "f" };

const account = (id: string, name: string, admin = false): StalwartAccount => ({
  id,
  "@type": "User",
  name,
  domainId: "d",
  description: name,
  emailAddress: `${name}@firma.de`,
  roles: rolesValue(admin, roles),
  permissions: { "@type": "Inherit" },
  credentials: { "0": { "@type": "Password" } },
});

/** A Stalwart that keeps the calls; enough for the rules the routes decide. */
const fakeManagement = () => {
  const updates: Record<string, Record<string, unknown>>[] = [];
  const created: Record<string, unknown>[] = [];
  const management: Management = {
    listAccounts: async () => [account("1", "chef", true), account("2", "anna")],
    listDomains: async () => [{ id: "d", name: "firma.de" }],
    loadRoles: async () => roles,
    createAccount: async (value) => {
      created.push(value);
      return { ok: true, value: "3" };
    },
    updateAccounts: async (patches) => {
      updates.push(patches);
      return { ok: true, value: null };
    },
  };
  return { management, updates, created };
};

const setup = (email: string | null) => {
  const fake = fakeManagement();
  const ended: string[] = [];
  const app = createCompanyRoutes({
    management: fake.management,
    currentEmail: async () => email,
    endSessions: async (address) => {
      ended.push(address);
    },
    random: (size) => new Uint8Array(size),
  });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { ...fake, ended, send };
};

describe("Firmenverwaltung", () => {
  it("is only for users with the company role", async () => {
    expect(await (await setup("anna@firma.de").send("GET", "/me")).json()).toEqual({
      admin: false,
    });
    expect((await setup("anna@firma.de").send("GET", "/")).status).toBe(403);
    expect((await setup(null).send("GET", "/")).status).toBe(403);
    expect(await (await setup("chef@firma.de").send("GET", "/me")).json()).toEqual({
      admin: true,
    });
  });

  it("creates a person with a new password", async () => {
    const { send, created } = setup("chef@firma.de");
    const response = await send("POST", "/employees", {
      email: "lena@firma.de",
      fullName: "Lena Klein",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "3", password: "aaaa-aaaa-aaaa-aaaa" });
    expect(created[0]).toMatchObject({ "@type": "User", name: "lena", domainId: "d" });
  });

  it("deactivates a person and ends their sessions", async () => {
    const { send, updates, ended } = setup("chef@firma.de");
    expect((await send("PATCH", "/employees/2", { active: false })).status).toBe(200);
    expect(updates[0]).toEqual({
      "2": {
        permissions: {
          "@type": "Merge",
          enabledPermissions: {},
          disabledPermissions: { authenticate: true },
        },
      },
    });
    expect(ended).toEqual(["anna@firma.de"]);
  });

  it("does not let the admin lock themselves out", async () => {
    const { send, updates } = setup("chef@firma.de");
    expect((await send("PATCH", "/employees/1", { admin: false })).status).toBe(400);
    expect((await send("PATCH", "/employees/1", { active: false })).status).toBe(400);
    expect(updates).toEqual([]);
  });

  it("resets a password and the second factor", async () => {
    const { send, updates } = setup("chef@firma.de");
    expect(await (await send("POST", "/employees/2/password")).json()).toEqual({
      password: "aaaa-aaaa-aaaa-aaaa",
    });
    await send("DELETE", "/employees/2/two-factor");
    expect(updates).toEqual([
      { "2": { "credentials/0/secret": "aaaa-aaaa-aaaa-aaaa" } },
      { "2": { "credentials/0/otpAuth": null } },
    ]);
  });
});
