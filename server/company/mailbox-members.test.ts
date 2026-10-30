import { describe, expect, it } from "vitest";
import type { Employee, SharedMailbox } from "./accounts";
import { membersOfOwnMailboxes } from "./mailbox-members";

const person = (id: string, email: string, active = true) => ({ id, email, active }) as Employee;
const mailbox = (id: string, memberIds: string[]) => ({ id, memberIds }) as SharedMailbox;

describe("membersOfOwnMailboxes", () => {
  const company = {
    employees: [person("a", "anna@firma.de"), person("j", "jonas@firma.de", false)],
    mailboxes: [mailbox("info", ["a", "j"]), mailbox("rechnung", ["j"])],
  };

  it("lists the members of the mailboxes the caller belongs to, whatever the case", () => {
    expect(membersOfOwnMailboxes(company, "Anna@Firma.de")).toEqual({ info: ["a"] });
  });

  it("lists nothing for a deactivated or unknown caller", () => {
    expect(membersOfOwnMailboxes(company, "jonas@firma.de")).toEqual({});
    expect(membersOfOwnMailboxes(company, "fremd@firma.de")).toEqual({});
  });

  it("leaves out members whose access is locked: nobody can work a mail given to them", () => {
    expect(membersOfOwnMailboxes(company, "anna@firma.de").info).toEqual(["a"]);
  });
});
