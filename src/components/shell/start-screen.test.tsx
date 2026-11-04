import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { rowWidths } from "@/components/ui/placeholder";
import { opensApp, StartScreen } from "./start-screen";

afterEach(cleanup);

describe("opensApp", () => {
  it("is true for the app's pages and the start", () => {
    for (const path of ["/", "/mail", "/mail/a/inbox", "/calendar", "/settings"]) {
      expect(opensApp(path)).toBe(true);
    }
  });

  it("is false for the sign-in and the public pages, also with a query (the demo's hash)", () => {
    for (const path of ["/login", "/login?redirect=%2Fmail", "/rsvp", "/s/abc", "/meet/x"]) {
      expect(opensApp(path)).toBe(false);
    }
    expect(opensApp("/agent-consent")).toBe(false);
  });
});

describe("rowWidths", () => {
  it("gives as many widths as lines, varied from row to row", () => {
    expect(rowWidths(0, 3)).toHaveLength(3);
    expect(rowWidths(4, 2)).toHaveLength(2);
    expect(rowWidths(0, 3)).not.toEqual(rowWidths(1, 3));
    expect(rowWidths(0, 3)).toEqual(rowWidths(3, 3));
  });
});

describe("StartScreen", () => {
  it("says it is loading once, with the bars hidden from screen readers", () => {
    const { container } = render(<StartScreen />);
    expect(screen.getAllByRole("status")).toHaveLength(1);
    expect(screen.getByRole("status").textContent).toMatch(/^(Lädt|Loading) …$/);
    expect(container.querySelectorAll("li").length).toBeGreaterThan(0);
    for (const item of container.querySelectorAll("li")) {
      expect(item.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });
});
