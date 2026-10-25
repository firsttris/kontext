// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/jscalendar";
import type { Task } from "../tasks/tasks";
import { type ContactSummary, eventSummary } from "./format";
import type { Reader } from "./reader";
import { customerTerms, TOOLS } from "./tools";

const keller: ContactSummary = {
  accountId: "d",
  account: "jonas@weber-haustechnik.test",
  id: "b",
  name: "Petra Keller",
  company: "Keller Elektro GmbH",
  emails: ["petra.keller@keller-elektro.test"],
  phones: [],
  addresses: [],
  note: "",
};

const run = (name: string, reader: Partial<Reader>, input: Record<string, unknown>) => {
  const tool = TOOLS.find((candidate) => candidate.name === name)!;
  return tool.run(reader as Reader, input as never) as Promise<Record<string, unknown>>;
};

describe("customer terms", () => {
  it("take names, companies and addresses of the matching contacts", () => {
    expect(customerTerms("Keller", [keller])).toEqual({
      emails: ["petra.keller@keller-elektro.test"],
      terms: ["Keller", "Petra Keller", "Keller Elektro GmbH"],
    });
  });

  it("take an address or a domain typed in as it is", () => {
    expect(customerTerms("@keller-elektro.test", []).emails).toEqual(["@keller-elektro.test"]);
    expect(customerTerms("keller-elektro.test", []).emails).toEqual(["keller-elektro.test"]);
    expect(customerTerms("Keller Elektro", []).emails).toEqual([]);
  });
});

describe("customer_overview", () => {
  const event = (id: string, start: string, title: string): CalendarEvent => ({
    id,
    calendarIds: { c: true },
    title,
    start,
    timeZone: "Europe/Berlin",
    duration: "PT1H",
  });
  const hour = 3_600_000;
  const local = (offset: number) =>
    new Date(Date.now() + offset)
      .toLocaleString("sv-SE", { timeZone: "Europe/Berlin" })
      .replace(" ", "T");
  const events = [
    event("past", local(-48 * hour), "Wartung Keller"),
    event("now", local(-0.5 * hour), "Besprechung Keller Elektro"),
    event("next", local(48 * hour), "Angebot Keller"),
    event("other", local(24 * hour), "Termin Hoffmann"),
  ].map((raw) => ({ raw, summary: eventSummary(raw, "d", {}) }));
  const task = { title: "Keller zurückrufen", notes: "", links: [] } as unknown as Task;

  it("gathers contacts, mails, appointments and tasks of the customer", async () => {
    let askedFor: string[] = [];
    const result = await run(
      "customer_overview",
      {
        contacts: async () => [keller],
        mailsWith: async (addresses) => {
          askedFor = addresses;
          return [];
        },
        events: async () => events,
        taskList: async () => ({
          all: [task, { ...task, title: "Hoffmann Bad" } as Task],
          summarize: (t: Task) => t.title as never,
        }),
      },
      { query: "Keller", mails: 10, daysBack: 90, daysAhead: 90 },
    );
    expect(askedFor).toEqual(["petra.keller@keller-elektro.test"]);
    const ids = (list: unknown) => (list as { id: string }[]).map((e) => e.id);
    expect(ids(result.pastAppointments)).toEqual(["past"]);
    // Still going on: upcoming.
    expect(ids(result.upcomingAppointments)).toEqual(["now", "next"]);
    expect(result.tasks).toEqual(["Keller zurückrufen"]);
  });

  it("searches mail by the words when no contact is known", async () => {
    let searched = "";
    await run(
      "customer_overview",
      {
        contacts: async () => [],
        searchMail: async (query) => {
          searched = query;
          return [];
        },
        events: async () => [],
        taskList: async () => ({ all: [], summarize: () => null as never }),
      },
      { query: "Wärmepumpe Lang", mails: 10, daysBack: 90, daysAhead: 90 },
    );
    expect(searched).toBe("Wärmepumpe Lang");
  });
});

describe("list_tasks", () => {
  const tasks = [
    { title: "Offen", accountId: "d", completedAt: null, notes: "", links: [] },
    {
      title: "Erledigt",
      accountId: "d",
      completedAt: "2026-10-01T00:00:00Z",
      notes: "",
      links: [],
    },
    { title: "Info offen", accountId: "b", completedAt: null, notes: "", links: [] },
  ] as unknown as Task[];
  const reader = {
    taskList: async () => ({ all: tasks, summarize: (t: Task) => t.title as never }),
  };

  it("shows open tasks, finished ones on request, by board and text", async () => {
    expect(await run("list_tasks", reader, { includeDone: false })).toEqual([
      "Offen",
      "Info offen",
    ]);
    expect(await run("list_tasks", reader, { includeDone: true, accountId: "d" })).toEqual([
      "Offen",
      "Erledigt",
    ]);
    expect(await run("list_tasks", reader, { includeDone: false, query: "info" })).toEqual([
      "Info offen",
    ]);
  });
});
