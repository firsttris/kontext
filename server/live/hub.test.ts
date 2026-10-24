import { describe, expect, it } from "vitest";
import { createHub, type LiveEvent } from "./hub";

describe("createHub", () => {
  it("sends an event only to the people it is meant for", () => {
    const hub = createHub();
    const jonas: LiveEvent[] = [];
    const max: LiveEvent[] = [];
    hub.subscribe({ me: "jonas", accountIds: ["jonas", "info"] }, (event) => jonas.push(event));
    hub.subscribe({ me: "max", accountIds: ["max"] }, (event) => max.push(event));
    hub.publish({ type: "tasks", accountId: "info" }, (viewer) =>
      viewer.accountIds.includes("info"),
    );
    expect(jonas).toContainEqual({ type: "tasks", accountId: "info" });
    expect(max).not.toContainEqual({ type: "tasks", accountId: "info" });
  });

  it("tells everyone who comes online and goes offline, once per person", () => {
    const hub = createHub();
    const seen: LiveEvent[] = [];
    hub.subscribe({ me: "jonas", accountIds: [] }, (event) => seen.push(event));
    const phone = hub.subscribe({ me: "anna", accountIds: [] }, () => undefined);
    const laptop = hub.subscribe({ me: "anna", accountIds: [] }, () => undefined);
    expect(hub.online()).toEqual(["jonas", "anna"]);
    phone();
    // Jonas himself, then Anna; her second device and closing one of them change nothing.
    expect(seen.filter((event) => event.type === "presence")).toHaveLength(2);
    laptop();
    expect(seen.at(-1)).toEqual({ type: "presence", online: ["jonas"] });
  });
});
