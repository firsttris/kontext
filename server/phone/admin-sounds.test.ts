// @vitest-environment node
import { describe, expect, it } from "vitest";
import { withoutSound } from "./admin-sounds";
import type { PhoneSettings } from "./store";

describe("withoutSound", () => {
  it("removes the greeting and wherever it was chosen", () => {
    const settings = {
      sounds: [
        { id: "a", name: "Mailbox", seconds: 8 },
        { id: "b", name: "Geschlossen", seconds: 6 },
      ],
      mailbox: { enabled: true, ringSeconds: 20, greeting: "a", deliverTo: null },
      hours: { enabled: true, open: [], closedDays: [], greeting: "b" },
      menu: { enabled: true, greeting: "a", options: [] },
    } as unknown as PhoneSettings;
    const next = withoutSound(settings, "a");
    expect(next.sounds.map((sound) => sound.id)).toEqual(["b"]);
    expect(next.mailbox.greeting).toBeNull();
    expect(next.hours.greeting).toBe("b");
    expect(next.menu.greeting).toBeNull();
    expect(withoutSound(settings, "b").mailbox.greeting).toBe("a");
    expect(withoutSound(settings, "b").hours.greeting).toBeNull();
  });
});
