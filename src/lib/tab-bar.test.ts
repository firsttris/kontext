import { describe, expect, it } from "vitest";
import { isDefaultTabs, moreModules, placeTab, tabBarModules } from "./tab-bar";

const ALL = ["/mail", "/calendar", "/contacts", "/tasks", "/chat", "/documents", "/phone"];
const CORE = ["/mail", "/calendar", "/contacts", "/tasks", "/chat"];

describe("tabBarModules", () => {
  it("shows the default without a choice", () => {
    expect(tabBarModules(null, ALL)).toEqual(["/mail", "/calendar", "/chat", "/tasks"]);
  });
  it("keeps the chosen apps in their order", () => {
    expect(tabBarModules(["/documents", "/mail", "/phone", "/calendar"], ALL)).toEqual([
      "/documents",
      "/mail",
      "/phone",
      "/calendar",
    ]);
  });
  it("drops apps that are no longer there and fills up with the default", () => {
    expect(tabBarModules(["/documents", "/mail", "/phone", "/contacts"], CORE)).toEqual([
      "/mail",
      "/contacts",
      "/calendar",
      "/chat",
    ]);
  });
  it("ignores foreign and repeated entries", () => {
    expect(tabBarModules(["/mail", "/mail", "/nope", "/tasks"], CORE)).toEqual([
      "/mail",
      "/tasks",
      "/calendar",
      "/chat",
    ]);
  });
  it("fills up with the other apps when the defaults are missing", () => {
    expect(tabBarModules(null, ["/mail", "/contacts", "/documents"])).toEqual([
      "/mail",
      "/contacts",
      "/documents",
    ]);
  });
  it("shows no more than the slots", () => {
    expect(tabBarModules(ALL, ALL, 3)).toEqual(["/mail", "/calendar", "/contacts"]);
  });
});

describe("moreModules", () => {
  it("lists the rest in the order of the apps", () => {
    expect(moreModules(ALL, ["/documents", "/mail", "/chat", "/tasks"])).toEqual([
      "/calendar",
      "/contacts",
      "/phone",
    ]);
  });
});

describe("placeTab", () => {
  const tabs = ["/mail", "/calendar", "/chat", "/tasks"];
  it("puts a new app into the slot", () => {
    expect(placeTab(tabs, 3, "/documents")).toEqual(["/mail", "/calendar", "/chat", "/documents"]);
  });
  it("swaps two apps that are both in the tab bar", () => {
    expect(placeTab(tabs, 0, "/tasks")).toEqual(["/tasks", "/calendar", "/chat", "/mail"]);
  });
  it("leaves the tab bar as it is for the same app", () => {
    expect(placeTab(tabs, 1, "/calendar")).toEqual(tabs);
  });
});

describe("isDefaultTabs", () => {
  it("knows the default", () => {
    expect(isDefaultTabs(["/mail", "/calendar", "/chat", "/tasks"], ALL)).toBe(true);
    expect(isDefaultTabs(["/mail", "/calendar", "/chat", "/documents"], ALL)).toBe(false);
  });
});
