import { describe, expect, it } from "vitest";
import { type Roles, rolesValue, type StalwartAccount } from "./accounts";
import type { Mailstore } from "./mailstore";
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
    listAccounts: async () => [
      account("1", "chef", true),
      account("2", "anna"),
      { id: "g", "@type": "Group", name: "info", domainId: "d", roles: { "@type": "Default" } },
    ],
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
  const shared: Record<string, Record<string, unknown>>[] = [];
  const rules: { accountId: string; rules: unknown[] }[] = [];
  const back: string[] = [];
  const mailstore: Mailstore = {
    listFolders: async (accountIds) =>
      Object.fromEntries(
        accountIds.map((id) => [id, [{ id: "inbox", role: "inbox", shareWith: null }]]),
      ),
    updateFolders: async (_accountId, update) => {
      shared.push(update);
      return { ok: true, value: null };
    },
    getVacation: async () => ({
      isEnabled: false,
      fromDate: null,
      toDate: null,
      subject: null,
      textBody: null,
      htmlBody: null,
      departed: false,
    }),
    setVacation: async () => ({ ok: true, value: null }),
    listIdentities: async () => [],
    setSieveScript: async () => ({ ok: true, value: null }),
    updateIdentities: async () => ({ ok: true, value: null }),
    getRules: async () => ({ rules: [], folders: [] }),
    setRules: async (accountId, list) => {
      rules.push({ accountId, rules: list });
      return { ok: true, value: null };
    },
    applyRules: async () => 2,
    endOffboarding: async (accountId) => {
      back.push(accountId);
      return { ok: true, value: null };
    },
  };
  return { management, mailstore, updates, created, shared, rules, back };
};

const setup = (email: string | null, welcomeError?: string) => {
  const fake = fakeManagement();
  const ended: string[] = [];
  const welcomed: { newcomer: string; people: string[] }[] = [];
  const shownToAll: string[][] = [];
  const changedMailboxes: string[] = [];
  const app = createCompanyRoutes({
    categories: {
      list: async (ids) => Object.fromEntries(ids.map((id) => [id, []])),
      save: async () => {},
    },
    management: fake.management,
    mailstore: fake.mailstore,
    calendars: {
      welcome: async (newcomer, people) => {
        welcomed.push({ newcomer, people });
        return welcomeError ? { ok: false, error: welcomeError } : { ok: true, value: 1 };
      },
      showEveryone: async (people) => {
        shownToAll.push(people);
        return { ok: true, value: people.length };
      },
    },
    settings: {
      signature: async () => null,
      saveSignature: async () => {},
      m365: async () => null,
      saveM365: async () => {},
    },
    migrations: {} as never,
    syncs: {} as never,
    currentEmail: async () => email,
    endSessions: async (address) => {
      ended.push(address);
    },
    random: (size) => new Uint8Array(size),
    mailboxChanged: (id) => {
      changedMailboxes.push(id);
    },
  });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return { ...fake, ended, welcomed, shownToAll, changedMailboxes, send };
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

  it("shows a new person's calendar to the colleagues and theirs to them", async () => {
    const { send, welcomed } = setup("chef@firma.de");
    await send("POST", "/employees", { email: "lena@firma.de", fullName: "Lena Klein" });
    expect(welcomed).toHaveLength(1);
    expect(welcomed[0]!.newcomer).toBe("3");
    expect(welcomed[0]!.people).toContain("3");
    expect(welcomed[0]!.people.length).toBeGreaterThan(1);
  });

  it("still hands out the new password when sharing the calendars fails", async () => {
    const { send, created } = setup("chef@firma.de", "Kalender: Stalwart-Verwaltung: 503");
    const response = await send("POST", "/employees", {
      email: "lena@firma.de",
      fullName: "Lena Klein",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ id: "3", password: "aaaa-aaaa-aaaa-aaaa" });
    expect(created).toHaveLength(1);
  });

  it("switches free and busy times on for all", async () => {
    const { send, shownToAll } = setup("chef@firma.de");
    const response = await send("POST", "/employees/availability");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ calendars: shownToAll[0]!.length });
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

  it("ends the offboarding when a person is unlocked again", async () => {
    const { send, back } = setup("chef@firma.de");
    expect((await send("PATCH", "/employees/2", { active: true })).status).toBe(200);
    expect(back).toEqual(["2"]);
  });

  it("keeps the rules of shared mailboxes, not of other accounts", async () => {
    const { send, rules } = setup("chef@firma.de");
    const rule = {
      id: "r",
      name: "",
      enabled: true,
      match: "all",
      conditions: [{ field: "subject", operator: "contains", value: "Rechnung" }],
      moveTo: null,
      markRead: true,
      flag: false,
      forwardTo: null,
      categories: [],
      stop: false,
    };
    expect((await send("PUT", "/mailboxes/g/rules", { rules: [rule] })).status).toBe(200);
    // A rule from before "Aufgabe anlegen" gets it switched off.
    expect(rules).toEqual([{ accountId: "g", rules: [{ ...rule, createTask: false }] }]);
    expect((await send("PUT", "/mailboxes/2/rules", { rules: [rule] })).status).toBe(404);
    expect((await send("PUT", "/mailboxes/g/rules", { rules: [{ id: 1 }] })).status).toBe(400);
    expect(await (await send("POST", "/mailboxes/g/rules/apply", { rule })).json()).toEqual({
      changed: 2,
    });
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

  it("gives a reader every folder of a shared mailbox, but not a member", async () => {
    const { send, shared, updates, changedMailboxes } = setup("chef@firma.de");
    const response = await send("PATCH", "/mailboxes/g", {
      memberIds: ["1"],
      readerIds: ["1", "2"],
    });
    expect(response.status).toBe(200);
    // Its folder in Dokumente follows.
    expect(changedMailboxes).toEqual(["g"]);
    expect(updates).toEqual([{ "1": { "memberGroupIds/g": true } }]);
    expect(shared).toEqual([
      { inbox: { "shareWith/2": { mayReadItems: true, maySetSeen: true } } },
    ]);
    // A new description changes nobody's access.
    await send("PATCH", "/mailboxes/g", { description: "Anfragen" });
    expect(changedMailboxes).toEqual(["g"]);
  });
});
