import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_NAMESPACE,
  assignablePeople,
  assignmentConditions,
  assignmentOf,
  assignmentPatch,
  withAssignment,
} from "./assignment";

const NS = ASSIGNMENT_NAMESPACE;

describe("assignmentOf", () => {
  it("reads who and whether done, and nothing from an empty or foreign value", () => {
    expect(assignmentOf({ metadata: { [NS]: { assignee: "g", state: "done" } } })).toEqual({
      assignee: "g",
      done: true,
    });
    expect(assignmentOf({})).toEqual({ assignee: null, done: false });
    expect(assignmentOf({ metadata: { [NS]: { assignee: 7, state: "open" } } })).toEqual({
      assignee: null,
      done: false,
    });
  });
});

describe("assignmentPatch", () => {
  it("writes the whole namespace, and removes it when nothing is left", () => {
    expect(assignmentPatch({ assignee: "g", done: false })).toEqual({
      [`metadata/${NS}`]: { assignee: "g" },
    });
    expect(assignmentPatch({ assignee: null, done: true })).toEqual({
      [`metadata/${NS}`]: { state: "done" },
    });
    expect(assignmentPatch({ assignee: null, done: false })).toEqual({ [`metadata/${NS}`]: null });
  });
});

describe("withAssignment", () => {
  it("changes only Kontext's namespace", () => {
    const email = { metadata: { "other.example": { x: 1 }, [NS]: { assignee: "g" } } };
    expect(withAssignment(email, { assignee: "h", done: true }).metadata).toEqual({
      "other.example": { x: 1 },
      [NS]: { assignee: "h", state: "done" },
    });
    expect(withAssignment(email, { assignee: null, done: false }).metadata).toEqual({
      "other.example": { x: 1 },
    });
  });
});

describe("assignmentConditions", () => {
  it("asks Stalwart for the mails of one person not done, or for all not done", () => {
    const notDone = {
      operator: "NOT",
      conditions: [{ metadataTextEquals: { path: `${NS}/state`, value: "done" } }],
    };
    expect(assignmentConditions("mine", "g")).toEqual([
      { metadataTextEquals: { path: `${NS}/assignee`, value: "g" } },
      notDone,
    ]);
    expect(assignmentConditions("open", "g")).toEqual([notDone]);
  });
});

describe("assignablePeople", () => {
  const people = [{ id: "a" }, { id: "j" }, { id: "m" }];

  it("offers the mailbox's members and keeps whoever has the mail now", () => {
    expect(assignablePeople(people, ["a", "j"], null)).toEqual([{ id: "a" }, { id: "j" }]);
    expect(assignablePeople(people, ["a"], "m")).toEqual([{ id: "a" }, { id: "m" }]);
  });

  it("offers everyone while the members are not known", () => {
    expect(assignablePeople(people, undefined, null)).toEqual(people);
  });
});
