// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { StalwartAccount } from "../company/accounts";
import type { Management } from "../company/management";
import { createCompanyMailboxes } from "./company-mailboxes";

const user = (id: string, name: string, extra: Partial<StalwartAccount> = {}): StalwartAccount => ({
  id,
  "@type": "User",
  name,
  domainId: "d1",
  ...extra,
});

const accounts: StalwartAccount[] = [
  user("u1", "jonas", { memberGroupIds: { g1: true } }),
  user("u2", "anna"),
  user("u3", "max", {
    memberGroupIds: { g1: true },
    permissions: { "@type": "Merge", disabledPermissions: { authenticate: true } },
  }),
  { id: "g1", "@type": "Group", name: "info", domainId: "d1" },
];

const fakes = () => {
  let reads = 0;
  const management = {
    listAccounts: async () => {
      reads += 1;
      return accounts;
    },
    loadRoles: async () => ({ userRoleIds: [], companyRoleId: "r1" }),
    listDomains: async () => [{ id: "d1", name: "Weber.test" }],
  } as unknown as Management;
  const mailstore = {
    listFolders: async () => ({
      g1: [{ id: "i", role: "inbox", shareWith: { u2: { mayReadItems: true } } }],
    }),
  };
  return { management, mailstore, reads: () => reads };
};

describe("the company's shared mailboxes", () => {
  it("names members to change and readers to open, active people only", async () => {
    const { management, mailstore } = fakes();
    expect(await createCompanyMailboxes({ management, mailstore }).load()).toEqual([
      {
        id: "g1",
        email: "info@weber.test",
        people: [
          { email: "jonas@weber.test", role: "edit" },
          { email: "anna@weber.test", role: "view" },
        ],
      },
    ]);
  });

  it("asks Stalwart again after half a minute or a change", async () => {
    const { management, mailstore, reads } = fakes();
    let time = 0;
    const mailboxes = createCompanyMailboxes({ management, mailstore, now: () => time });
    await mailboxes.load();
    await mailboxes.load();
    expect(reads()).toBe(1);
    time = 31_000;
    await mailboxes.load();
    mailboxes.forget();
    await mailboxes.load();
    expect(reads()).toBe(3);
  });
});
