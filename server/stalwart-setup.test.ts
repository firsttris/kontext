// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { Invocation } from "./company/management";
import {
  type Account,
  accountPlan,
  directoryQueriesPlan,
  ensureRole,
  ensureServerAccount,
  hasApiKey,
  KONTEXT_SERVER_RIGHTS,
  oauthClientPlan,
  PASSKEY_RIGHTS,
  PASSKEY_RIGHTS_HINT,
  passkeyRightsMessage,
  pickDomain,
  type Request,
  type Role,
  rolePlan,
} from "./stalwart-setup";

const domain = { id: "d1", name: "firma.de" };

describe("the OAuth client", () => {
  it("is created with the redirect URI and the scope full", () => {
    const plan = oauthClientPlan([{ id: "x", clientId: "other" }]);
    expect(plan.calls).toEqual([
      [
        "x:OAuthClient/set",
        {
          create: {
            kontext: {
              clientId: "kontext",
              description: "Kontext",
              redirectUris: { "https://kontext.invalid/oauth": true },
              scopes: { full: true },
            },
          },
        },
        "0",
      ],
    ]);
  });

  it("gets full added when it was made before Stalwart 1.0.3", () => {
    const plan = oauthClientPlan([{ id: "b", clientId: "kontext", scopes: {} }]);
    expect(plan.calls).toEqual([
      ["x:OAuthClient/set", { update: { b: { "scopes/full": true } } }, "0"],
    ]);
  });

  it("stays as it is with full", () => {
    expect(
      oauthClientPlan([{ id: "b", clientId: "kontext", scopes: { full: true } }]).calls,
    ).toEqual([]);
  });
});

describe("directory queries", () => {
  it("are allowed and the settings reloaded", () => {
    const names = directoryQueriesPlan({ allowDirectoryQueries: false }).calls.map(([n]) => n);
    expect(names).toEqual(["x:Sharing/set", "x:Action/set"]);
  });

  it("change nothing when allowed", () => {
    expect(directoryQueriesPlan({ allowDirectoryQueries: true }).calls).toEqual([]);
  });
});

describe("the role Kontext-Server", () => {
  it("is created inheriting User, with exactly the documented rights", () => {
    const [[, args]] = rolePlan([{ id: "b", description: "User" }], ["b"]).calls as [Invocation];
    expect(args).toEqual({
      create: {
        role: {
          description: "Kontext-Server",
          roleIds: { b: true },
          enabledPermissions: Object.fromEntries(KONTEXT_SERVER_RIGHTS.map((r) => [r, true])),
        },
      },
    });
  });

  it("gets only the missing rights and the inherited role", () => {
    const enabled = Object.fromEntries(
      KONTEXT_SERVER_RIGHTS.filter((r) => r !== "impersonate").map((r) => [r, true]),
    );
    const role = { id: "f", description: "Kontext-Server", enabledPermissions: enabled };
    const plan = rolePlan([role], ["b"]);
    expect(plan.calls).toEqual([
      [
        "x:Role/set",
        { update: { f: { "enabledPermissions/impersonate": true, "roleIds/b": true } } },
        "0",
      ],
    ]);
    expect(plan.message).toContain("impersonate");
  });

  it("stays as it is when complete", () => {
    const role = {
      id: "f",
      description: "Kontext-Server",
      roleIds: { b: true },
      enabledPermissions: Object.fromEntries(KONTEXT_SERVER_RIGHTS.map((r) => [r, true])),
    };
    expect(rolePlan([role], ["b"]).calls).toEqual([]);
  });
});

describe("the domain", () => {
  it("is the only one, or the one asked for", () => {
    expect(pickDomain([domain])).toEqual({ ok: true, value: domain });
    const other = { id: "d2", name: "zweit.de" };
    expect(pickDomain([domain, other], "Zweit.de")).toEqual({ ok: true, value: other });
  });

  it("must be chosen among several, and must exist", () => {
    const several = pickDomain([domain, { id: "d2", name: "zweit.de" }]);
    expect(several.ok === false && several.error).toContain("--domain");
    expect(pickDomain([]).ok).toBe(false);
    expect(pickDomain([domain], "fehlt.de").ok).toBe(false);
  });
});

const serverAccount = (extra: Partial<Account> = {}): Account => ({
  id: "a1",
  "@type": "User",
  name: "kontext-server",
  domainId: "d1",
  roles: { "@type": "Custom", roleIds: { f: true } },
  credentials: { "0": { "@type": "Password" } },
  ...extra,
});

describe("the account kontext-server", () => {
  it("is created with the role and the password", () => {
    const [[, args]] = accountPlan(undefined, domain, "f", "pw").calls as [Invocation];
    expect(args).toMatchObject({
      create: {
        account: {
          "@type": "User",
          name: "kontext-server",
          domainId: "d1",
          roles: { "@type": "Custom", roleIds: { f: true } },
          credentials: { "0": { "@type": "Password", secret: "pw" } },
        },
      },
    });
  });

  it("gets the role when it has another one", () => {
    const account = serverAccount({ roles: { "@type": "User" } });
    expect(accountPlan(account, domain, "f", "pw").calls).toEqual([
      [
        "x:Account/set",
        { update: { a1: { roles: { "@type": "Custom", roleIds: { f: true } } } } },
        "0",
      ],
    ]);
  });

  it("stays as it is with the role", () => {
    expect(accountPlan(serverAccount(), domain, "f", "pw").calls).toEqual([]);
  });

  it("tells whether it has an API key", () => {
    expect(hasApiKey(serverAccount())).toBe(false);
    const withKey = serverAccount({
      credentials: { "0": { "@type": "Password" }, "1": { "@type": "ApiKey" } },
    });
    expect(hasApiKey(withKey)).toBe(true);
  });
});

/** A Stalwart that answers each method with the given argument object. */
const stalwart = (answers: Record<string, Record<string, unknown>>): Request =>
  vi.fn(async (calls: Invocation[]) =>
    calls.map(([name, , id]): Invocation => [name, answers[name] ?? {}, id]),
  );

describe("setting up the account and its key", () => {
  const newPassword = () => "random";

  it("creates the account and signs in as it for the key", async () => {
    const admin = stalwart({
      "x:Domain/get": { list: [domain] },
      "x:Account/get": { list: [] },
      "x:Account/set": { created: { account: { id: "a1" } } },
    });
    const asAccount = stalwart({
      "x:ApiKey/set": { created: { key: { id: "k", secret: "API_new" } } },
    });
    const requestAs = vi.fn(() => asAccount);
    const result = await ensureServerAccount(admin, requestAs, { roleId: "f", newPassword });
    expect(result).toMatchObject({ ok: true, value: { key: "API_new" } });
    expect(requestAs).toHaveBeenCalledWith("kontext-server@firma.de", "random");
  });

  it("makes no second key", async () => {
    const withKey = serverAccount({ credentials: { "1": { "@type": "ApiKey" } } });
    const admin = stalwart({
      "x:Domain/get": { list: [domain] },
      "x:Account/get": { list: [withKey] },
    });
    const requestAs = vi.fn(() => stalwart({}));
    const result = await ensureServerAccount(admin, requestAs, { roleId: "f", newPassword });
    expect(result.ok && result.value.key).toBe(undefined);
    expect(requestAs).not.toHaveBeenCalled();
  });

  it("runs again without --domain once a second domain was added", async () => {
    const withKey = serverAccount({ credentials: { "1": { "@type": "ApiKey" } } });
    const admin = stalwart({
      "x:Domain/get": { list: [domain, { id: "d2", name: "zweit.de" }] },
      "x:Account/get": { list: [withKey] },
    });
    const requestAs = vi.fn(() => stalwart({}));
    const result = await ensureServerAccount(admin, requestAs, { roleId: "f", newPassword });
    expect(result.ok).toBe(true);
    expect(requestAs).not.toHaveBeenCalled();
  });

  it("passes on Stalwart's refusal as a value", async () => {
    const admin = stalwart({
      "x:Domain/get": { list: [domain] },
      "x:Account/get": { list: [] },
      "x:Account/set": {
        notCreated: { account: { type: "invalidProperties", description: "Nein" } },
      },
    });
    const result = await ensureServerAccount(admin, vi.fn(), { roleId: "f", newPassword });
    expect(result).toEqual({ ok: false, error: "Konto kontext-server@firma.de: Nein" });
  });
});

/**
 * Stalwart's admin may only grant rights it holds itself (validate_role and can_grant_permissions
 * in crates/jmap/src/registry/mapping/principal.rs, crates/common/src/auth/permissions.rs); on a
 * Stalwart updated from before 1.0.2 its role lacks the encryption rights (CHANGELOG.md, 1.0.2).
 */
const adminWithoutEncryptionRights = (roles: unknown[]) => {
  const sets: Record<string, unknown>[] = [];
  const refusal = {
    type: "forbidden",
    description: "You are not authorized to grant permissions: sysEncryptionGet",
  };
  const answer = (args: Record<string, unknown>): Record<string, unknown> => {
    sets.push(args);
    const refused = /sysEncryption|sysExternalPublicKey/.test(JSON.stringify(args));
    if (args.create)
      return refused ? { notCreated: { role: refusal } } : { created: { role: { id: "f" } } };
    return refused ? { notUpdated: { f: refusal } } : { updated: { f: null } };
  };
  const request: Request = vi.fn(async (calls: Invocation[]) =>
    calls.map(([name, args, id]): Invocation => {
      if (name === "x:Authentication/get")
        return [name, { list: [{ defaultUserRoleIds: { b: true } }] }, id];
      if (name === "x:Role/get") return [name, { list: roles }, id];
      return [name, name === "x:Role/set" ? answer(args) : {}, id];
    }),
  );
  return { request, sets };
};

describe("the role on a Stalwart updated from before 1.0.2", () => {
  it("gets every other right and a hint instead of stopping the setup", async () => {
    const role = {
      id: "f",
      description: "Kontext-Server",
      roleIds: { b: true },
      enabledPermissions: { sysAccountGet: true, sysRoleGet: true },
    };
    const { request, sets } = adminWithoutEncryptionRights([role]);
    const result = await ensureRole(request);
    expect(result).toMatchObject({ ok: true, value: { id: "f" } });
    expect(result.ok && result.value.message).toContain("1.0.2");
    expect(JSON.stringify(sets.at(-1))).toContain("enabledPermissions/impersonate");
  });

  it("is still created on a first setup", async () => {
    const { request } = adminWithoutEncryptionRights([]);
    const result = await ensureRole(request);
    expect(result).toMatchObject({ ok: true, value: { id: "f" } });
    expect(result.ok && result.value.message).toContain("1.0.2");
  });
});

describe("the passkey rights of new users", () => {
  const all = Object.fromEntries(PASSKEY_RIGHTS.map((right) => [right, true]));

  it("are there on a new Stalwart 1.1.0, whose User role has them", () => {
    const roles = [
      { id: "b", description: "User", enabledPermissions: { ...all, emailSend: true } },
    ];
    expect(passkeyRightsMessage(roles, ["b"])).not.toBe(PASSKEY_RIGHTS_HINT);
  });

  it("count when inherited from another role", () => {
    const roles = [
      { id: "b", description: "User", roleIds: { p: true } },
      { id: "p", description: "Passkeys", enabledPermissions: all },
    ];
    expect(passkeyRightsMessage(roles, ["b"])).not.toBe(PASSKEY_RIGHTS_HINT);
  });

  it("are missing on a server updated from before 1.1.0: the admin gets the hint", () => {
    const roles = [{ id: "b", description: "User", enabledPermissions: { emailSend: true } }];
    expect(passkeyRightsMessage(roles, ["b"])).toBe(PASSKEY_RIGHTS_HINT);
  });

  it("do not loop on roles that inherit each other", () => {
    const roles: Role[] = [
      { id: "a", description: "A", roleIds: { b: true } },
      { id: "b", description: "B", roleIds: { a: true } },
    ];
    expect(passkeyRightsMessage(roles, ["a"])).toBe(PASSKEY_RIGHTS_HINT);
  });
});
