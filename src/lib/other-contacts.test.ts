import { describe, expect, it } from "vitest";
import { type Correspondence, otherContacts } from "./other-contacts";

const mail = (
  from: [string, string],
  to: [string, string][],
  receivedAt: string,
  extra: Partial<Correspondence> = {},
): Correspondence => ({
  from: [{ name: from[0], email: from[1] }],
  to: to.map(([name, email]) => ({ name, email })),
  cc: null,
  receivedAt,
  bulk: false,
  ...extra,
});

const jonas: [string, string] = ["Jonas Weber", "jonas@weber.test"];
const info: [string, string] = ["Weber Haustechnik", "info@weber.test"];
const own = ["jonas@weber.test", "info@weber.test"];

describe("otherContacts", () => {
  it("collects senders of received and recipients of sent mails", () => {
    const people = otherContacts(
      [
        mail(["Stadtwerke Bühl", "service@stadtwerke.test"], [jonas], "2026-10-03T10:00:00Z"),
        mail(jonas, [["", "neu@kunde.test"]], "2026-10-02T10:00:00Z", {
          cc: [{ name: "Chef", email: "chef@kunde.test" }],
        }),
        mail(info, [["Frau Neu", "Neu@Kunde.test"]], "2026-10-01T10:00:00Z"),
      ],
      { own, known: [] },
    );
    expect(people).toEqual([
      {
        name: "Stadtwerke Bühl",
        email: "service@stadtwerke.test",
        count: 1,
        lastAt: "2026-10-03T10:00:00Z",
      },
      { name: "Frau Neu", email: "neu@kunde.test", count: 2, lastAt: "2026-10-02T10:00:00Z" },
      { name: "Chef", email: "chef@kunde.test", count: 1, lastAt: "2026-10-02T10:00:00Z" },
    ]);
  });

  it("uses the name of the latest mail", () => {
    const [person] = otherContacts(
      [
        mail(["P. Keller", "p@keller.test"], [jonas], "2026-10-01T10:00:00Z"),
        mail(["Petra Keller", "p@keller.test"], [jonas], "2026-10-05T10:00:00Z"),
      ],
      { own, known: [] },
    );
    expect(person?.name).toBe("Petra Keller");
  });

  it("leaves out known people, own addresses, newsletters and machines", () => {
    expect(
      otherContacts(
        [
          mail(["Petra Keller", "petra@keller.test"], [jonas], "2026-10-01T10:00:00Z"),
          mail(["Anna Weber", "anna@weber.test"], [jonas], "2026-10-01T10:00:00Z"),
          mail(["Shop", "angebote@shop.test"], [jonas], "2026-10-01T10:00:00Z", { bulk: true }),
          mail(["Shop", "noreply@shop.test"], [jonas], "2026-10-01T10:00:00Z"),
          mail(["Post", "MAILER-DAEMON@weber.test"], [jonas], "2026-10-01T10:00:00Z"),
          mail(jonas, [info], "2026-10-01T10:00:00Z"),
        ],
        { own, known: ["Petra@Keller.test", "anna@weber.test"] },
      ),
    ).toEqual([]);
  });
});
