import { describe, expect, it } from "vitest";
import {
  aliasesValue,
  isCompanyUser,
  membershipPatches,
  newPassword,
  parseAddress,
  passwordKey,
  permissionsValue,
  type Roles,
  rolesValue,
  type StalwartAccount,
  toCompany,
} from "./accounts";

const roles: Roles = { userRoleIds: ["b"], companyRoleId: "f" };
const domains = [{ id: "b", name: "firma.de" }];

const user = (patch: Partial<StalwartAccount> = {}): StalwartAccount => ({
  id: "u",
  "@type": "User",
  name: "jonas",
  domainId: "b",
  description: "Jonas Weber",
  emailAddress: "jonas@firma.de",
  roles: { "@type": "User" },
  permissions: { "@type": "Inherit" },
  credentials: { "0": { "@type": "Password" } },
  memberGroupIds: {},
  aliases: {},
  usedDiskQuota: 100,
  ...patch,
});

const group = (patch: Partial<StalwartAccount> = {}): StalwartAccount => ({
  id: "g",
  "@type": "Group",
  name: "info",
  domainId: "b",
  description: "Allgemeine Anfragen",
  emailAddress: "info@firma.de",
  roles: { "@type": "Default" },
  ...patch,
});

describe("isCompanyUser", () => {
  it("takes normal users and those with the company mark", () => {
    expect(isCompanyUser(user(), roles)).toBe(true);
    expect(isCompanyUser(user({ roles: rolesValue(true, roles) }), roles)).toBe(true);
  });

  it("leaves Stalwart's admins and other roles to the operator", () => {
    expect(isCompanyUser(user({ roles: { "@type": "Admin" } }), roles)).toBe(false);
    expect(
      isCompanyUser(user({ roles: { "@type": "Custom", roleIds: { b: true, e: true } } }), roles),
    ).toBe(false);
    expect(isCompanyUser(group(), roles)).toBe(false);
  });
});

describe("toCompany", () => {
  it("shows people with their state and mailboxes with their members", () => {
    const company = toCompany(
      [
        user({
          id: "u1",
          roles: rolesValue(true, roles),
          memberGroupIds: { g: true },
          aliases: { "0": { name: "chef", domainId: "b" } },
          credentials: { "0": { "@type": "Password", otpUrl: "****" } },
        }),
        user({
          id: "u2",
          name: "anna",
          description: "Anna Weber",
          emailAddress: "anna@firma.de",
          permissions: { "@type": "Merge", disabledPermissions: { authenticate: true } },
        }),
        user({ id: "admin", roles: { "@type": "Admin" } }),
        group(),
      ],
      roles,
      domains,
    );
    expect(company.employees.map((e) => [e.fullName, e.admin, e.active, e.twoFactor])).toEqual([
      ["Anna Weber", false, false, false],
      ["Jonas Weber", true, true, true],
    ]);
    expect(company.employees[1]!.aliases).toEqual(["chef@firma.de"]);
    expect(company.mailboxes).toEqual([
      {
        id: "g",
        email: "info@firma.de",
        description: "Allgemeine Anfragen",
        aliases: [],
        memberIds: ["u1"],
        readerIds: [],
        usedBytes: 0,
      },
    ]);
  });
});

describe("parseAddress and aliasesValue", () => {
  it("accepts only the server's domains", () => {
    expect(parseAddress(" Lena@Firma.de ", domains)).toEqual({
      ok: true,
      value: { name: "lena", domainId: "b" },
    });
    expect(parseAddress("lena@gmail.com", domains).ok).toBe(false);
    expect(parseAddress("kein text", domains).ok).toBe(false);
  });

  it("builds Stalwart's alias list without duplicates", () => {
    expect(aliasesValue(["chef@firma.de", "Chef@firma.de ", ""], domains)).toEqual({
      ok: true,
      value: { "0": { name: "chef", domainId: "b", enable: true } },
    });
    expect(aliasesValue(["chef@andere.de"], domains).ok).toBe(false);
  });
});

describe("permissionsValue", () => {
  it("takes the right to sign in away and gives it back", () => {
    const off = permissionsValue(false, { "@type": "Inherit" });
    expect(off).toEqual({
      "@type": "Merge",
      enabledPermissions: {},
      disabledPermissions: { authenticate: true },
    });
    expect(permissionsValue(true, off)).toEqual({ "@type": "Inherit" });
  });

  it("keeps other permissions the operator set", () => {
    expect(
      permissionsValue(true, {
        "@type": "Merge",
        disabledPermissions: { authenticate: true, interactAi: true },
      }),
    ).toEqual({
      "@type": "Merge",
      enabledPermissions: {},
      disabledPermissions: { interactAi: true },
    });
  });
});

describe("rolesValue", () => {
  it("adds the company mark to the default user roles", () => {
    expect(rolesValue(true, roles)).toEqual({ "@type": "Custom", roleIds: { b: true, f: true } });
    expect(rolesValue(false, roles)).toEqual({ "@type": "User" });
  });
});

describe("membershipPatches", () => {
  it("changes only who joins or leaves", () => {
    const users = [
      user({ id: "a", memberGroupIds: { g: true } }),
      user({ id: "b" }),
      user({ id: "c", memberGroupIds: { g: true } }),
    ];
    expect(membershipPatches("g", ["a", "b"], users)).toEqual({
      b: { "memberGroupIds/g": true },
      c: { "memberGroupIds/g": null },
    });
  });
});

describe("passwordKey and newPassword", () => {
  it("finds the password among the credentials", () => {
    expect(
      passwordKey(
        user({
          credentials: { "0": { "@type": "AppPassword" }, "1": { "@type": "Password" } },
        }),
      ),
    ).toBe("1");
  });

  it("makes four readable groups", () => {
    const password = newPassword((size) => new Uint8Array(size).map((_, i) => i * 7));
    expect(password).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    expect(password).not.toMatch(/[01lo]/);
  });
});
