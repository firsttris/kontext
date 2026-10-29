import { describe, expect, it } from "vitest";
import { evaluatePointer, handleRequest, sessionOf } from "./jmap";
import { createStore } from "./store";

const signedIn = (user: string) => ({ ...createStore(), user });

describe("evaluatePointer", () => {
  it("collects through arrays with *", () => {
    const result = { list: [{ emailIds: ["a", "b"] }, { emailIds: ["c"] }] };
    expect(evaluatePointer(result, "/list/*/emailIds")).toEqual(["a", "b", "c"]);
    expect(evaluatePointer({ ids: ["x"] }, "/ids")).toEqual(["x"]);
  });
});

describe("handleRequest", () => {
  it("passes a query's ids to the next call", () => {
    const store = signedIn("jonas");
    const { methodResponses } = handleRequest(store, {
      methodCalls: [
        ["Email/query", { accountId: "info", filter: { inMailbox: "info-inbox" } }, "q"],
        [
          "Email/get",
          {
            accountId: "info",
            "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
            properties: ["subject"],
          },
          "g",
        ],
      ],
    });
    const subjects = (methodResponses[1]![1].list as { subject: string }[]).map((e) => e.subject);
    expect(subjects).toEqual(["Anfrage Wärmepumpe Neubau", "Wasserhahn tropft wieder"]);
  });

  it("keeps out accounts not in the session", () => {
    const { methodResponses } = handleRequest(signedIn("max"), {
      methodCalls: [["Mailbox/get", { accountId: "info" }, "0"]],
    });
    expect(methodResponses[0]).toEqual(["error", { type: "accountNotFound" }, "0"]);
  });

  it("answers what it does not hold as an empty server", () => {
    const { methodResponses } = handleRequest(signedIn("jonas"), {
      methodCalls: [["CalendarEvent/query", { accountId: "jonas" }, "0"]],
    });
    expect(methodResponses[0]![1]).toMatchObject({ ids: [], total: 0 });
  });
});

describe("sessionOf", () => {
  it("shows a person their own account and their groups'", () => {
    const session = sessionOf(signedIn("sandra"), "https://demo.test");
    expect(Object.keys(session.accounts)).toEqual(["sandra", "info"]);
    expect(session.accounts.info!.isPersonal).toBe(false);
    expect(session.apiUrl).toBe("https://demo.test/jmap/");
  });
});
