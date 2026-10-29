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
const fakeManagement = ({ annaInInfo = false } = {}) => {
  const updates: Record<string, Record<string, unknown>>[] = [];
  const created: Record<string, unknown>[] = [];
  const management: Management = {
    listAccounts: async () => [
      account("1", "chef", true),
      { ...account("2", "anna"), ...(annaInInfo ? { memberGroupIds: { g: true as const } } : {}) },
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

const setup = (
  email: string | null,
  options: { welcomeError?: string; annaInInfo?: boolean } = {},
) => {
  const { welcomeError } = options;
  const fake = fakeManagement(options);
  const footer = { text: "" };
  const idle = { minutes: 0 };
  const ended: string[] = [];
  const welcomed: { newcomer: string; people: string[] }[] = [];
  const shownToAll: string[][] = [];
  const changedMailboxes: string[] = [];
  let externalHint = { enabled: false, partners: [] as string[] };
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
      legalFooter: async () => footer.text,
      saveLegalFooter: async (text) => {
        footer.text = text;
      },
      idleLogout: async () => idle.minutes,
      saveIdleLogout: async (minutes) => {
        idle.minutes = minutes;
      },
    },
    externalHint: {
      read: async () => externalHint,
      save: async (settings) => {
        externalHint = settings;
      },
    },
    signatureDetails: {
      of: async () => ({ phone: "", mobile: "", position: "", department: "" }),
      save: async () => {},
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
    backup: {
      read: async () => ({
        settings: { enabled: true, time: "03:00" },
        status: null,
        requested: false,
        host: "missing",
        log: "",
      }),
      saveSettings: async () => {},
      requestRun: async () => {},
    },
  });
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const hint = () => externalHint;
  return { ...fake, ended, welcomed, shownToAll, changedMailboxes, footer, idle, send, hint };
};

type Setup = ReturnType<typeof setup>;

describe("Firmenverwaltung", () => {
  it("is only for users with the company role", async () => {
    expect(await (await setup("anna@firma.de").send("GET", "/me")).json()).toEqual({
      admin: false,
    });
    expect((await setup("anna@firma.de").send("GET", "/")).status).toBe(403);
    expect((await setup(null).send("GET", "/")).status).toBe(403);
    expect((await setup("anna@firma.de").send("POST", "/backup/run")).status).toBe(403);
    expect((await setup("chef@firma.de").send("GET", "/backup")).status).toBe(200);
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
    const { send, created } = setup("chef@firma.de", {
      welcomeError: "Kalender: Stalwart-Verwaltung: 503",
    });
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

  it("lets the shared mailboxes' folders in Dokumente follow a person's membership", async () => {
    const joining = setup("chef@firma.de");
    expect((await joining.send("PATCH", "/employees/2", { mailboxIds: ["g"] })).status).toBe(200);
    expect(joining.updates).toEqual([{ "2": { "memberGroupIds/g": true } }]);
    expect(joining.changedMailboxes).toEqual(["g"]);
    // The dialog sends the mailboxes with every save; unchanged ones are left alone.
    await joining.send("PATCH", "/employees/2", { fullName: "Anna W.", mailboxIds: [] });
    expect(joining.changedMailboxes).toEqual(["g"]);

    const created = setup("chef@firma.de");
    const made = await created.send("POST", "/employees", {
      fullName: "Bert",
      email: "bert@firma.de",
      mailboxIds: ["g"],
    });
    expect(made.status).toBe(201);
    expect(created.changedMailboxes).toEqual(["g"]);

    for (const leave of [
      (send: Setup["send"]) => send("PATCH", "/employees/2", { active: false }),
      (send: Setup["send"]) => send("PATCH", "/employees/2", { mailboxIds: [] }),
      (send: Setup["send"]) =>
        send("POST", "/employees/2/offboarding", {
          handoverTo: null,
          forwardTo: null,
          reply: null,
        }),
    ]) {
      const member = setup("chef@firma.de", { annaInInfo: true });
      expect((await leave(member.send)).status).toBe(200);
      expect(member.changedMailboxes).toEqual(["g"]);
    }
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

  it("keeps an employee's own rules, not those of unknown accounts", async () => {
    const { send, rules } = setup("chef@firma.de");
    const rule = {
      id: "r",
      name: "",
      enabled: true,
      match: "all",
      conditions: [{ field: "from", operator: "contains", value: "lieferant.de" }],
      moveTo: null,
      markRead: false,
      flag: true,
      forwardTo: null,
      categories: [],
      stop: false,
      createTask: false,
    };
    expect(await (await send("GET", "/employees/2/rules")).json()).toEqual({
      rules: [],
      folders: [],
      categories: [],
    });
    expect((await send("PUT", "/employees/2/rules", { rules: [rule] })).status).toBe(200);
    expect(rules).toEqual([{ accountId: "2", rules: [rule] }]);
    // A shared mailbox is not an employee, nor is an account outside the company.
    expect((await send("PUT", "/employees/g/rules", { rules: [rule] })).status).toBe(404);
    expect((await send("GET", "/employees/9/rules")).status).toBe(404);
    expect(await (await send("POST", "/employees/2/rules/apply", { rule })).json()).toEqual({
      changed: 2,
    });
  });

  it("keeps employees' rules to the admin", async () => {
    const { send, rules } = setup("anna@firma.de");
    expect((await send("GET", "/employees/1/rules")).status).toBe(403);
    expect((await send("PUT", "/employees/1/rules", { rules: [] })).status).toBe(403);
    expect(rules).toEqual([]);
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

  it("gives everyone signed in the hint „Extern“ with the company's domains", async () => {
    const anna = setup("anna@firma.de");
    expect(await (await anna.send("GET", "/external-hint")).json()).toEqual({
      enabled: false,
      partners: [],
      domains: ["firma.de"],
    });
    expect((await setup(null).send("GET", "/external-hint")).status).toBe(401);
  });

  it("lets only the Firmenverwaltung switch the hint „Extern“ and name partners", async () => {
    const change = { enabled: true, partners: ["@Partner-Bau.de", "steuer.de", "partner-bau.de"] };
    const anna = setup("anna@firma.de");
    expect((await anna.send("PUT", "/external-hint", change)).status).toBe(403);
    expect(anna.hint().enabled).toBe(false);

    const chef = setup("chef@firma.de");
    const saved = await chef.send("PUT", "/external-hint", change);
    expect(await saved.json()).toEqual({
      enabled: true,
      partners: ["partner-bau.de", "steuer.de"],
    });
    expect(chef.hint()).toEqual({ enabled: true, partners: ["partner-bau.de", "steuer.de"] });
    const wrong = await chef.send("PUT", "/external-hint", { enabled: true, partners: ["kein"] });
    expect(wrong.status).toBe(400);
    expect(chef.hint().partners).toEqual(["partner-bau.de", "steuer.de"]);
  });

  it("lets everyone signed in read the Pflichtangaben, only the admin change them", async () => {
    const anna = setup("anna@firma.de");
    anna.footer.text = "Firma GmbH · HRB 1";
    expect(await (await anna.send("GET", "/legal-footer")).json()).toEqual({
      text: "Firma GmbH · HRB 1",
    });
    expect((await anna.send("PUT", "/legal-footer", { text: "x" })).status).toBe(403);
    expect(anna.footer.text).toBe("Firma GmbH · HRB 1");
    expect((await setup(null).send("GET", "/legal-footer")).status).toBe(401);
  });

  it("keeps the Pflichtangaben tidied, and empty switches them off", async () => {
    const chef = setup("chef@firma.de");
    const saved = await chef.send("PUT", "/legal-footer", {
      text: "  Firma GmbH  \r\nHRB 1\n\n\n",
    });
    expect(await saved.json()).toEqual({ text: "Firma GmbH\nHRB 1" });
    expect(chef.footer.text).toBe("Firma GmbH\nHRB 1");
    await chef.send("PUT", "/legal-footer", { text: "" });
    expect(chef.footer.text).toBe("");
    expect((await chef.send("PUT", "/legal-footer", { text: "x".repeat(2001) })).status).toBe(400);
    expect((await chef.send("PUT", "/legal-footer", {})).status).toBe(400);
  });

  it("lets everyone signed in read the time for Abmelden nach Inaktivität, only the admin set it", async () => {
    const anna = setup("anna@firma.de");
    expect(await (await anna.send("GET", "/idle-logout")).json()).toEqual({ minutes: 0 });
    anna.idle.minutes = 30;
    expect(await (await anna.send("GET", "/idle-logout")).json()).toEqual({ minutes: 30 });
    expect((await anna.send("PUT", "/idle-logout", { minutes: 15 })).status).toBe(403);
    expect(anna.idle.minutes).toBe(30);
    expect((await setup(null).send("GET", "/idle-logout")).status).toBe(401);
  });

  it("takes only the times offered, and 0 switches it off", async () => {
    const chef = setup("chef@firma.de");
    const saved = await chef.send("PUT", "/idle-logout", { minutes: 60 });
    expect(await saved.json()).toEqual({ minutes: 60 });
    expect(chef.idle.minutes).toBe(60);
    expect((await chef.send("PUT", "/idle-logout", { minutes: 7 })).status).toBe(400);
    expect((await chef.send("PUT", "/idle-logout", { minutes: "15" })).status).toBe(400);
    expect((await chef.send("PUT", "/idle-logout", {})).status).toBe(400);
    expect(chef.idle.minutes).toBe(60);
    await chef.send("PUT", "/idle-logout", { minutes: 0 });
    expect(chef.idle.minutes).toBe(0);
  });
});
