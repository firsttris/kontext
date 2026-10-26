import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharedOffer } from "./shared-offer";

afterEach(cleanup);

describe("SharedOffer", () => {
  it("shows what was shared and takes it only on request", () => {
    const onTake = vi.fn();
    const onDiscard = vi.fn();
    render(
      <SharedOffer
        shared={{
          subject: "Schaden Bad",
          body: "Foto vom Wasserschaden",
          files: [new File(["bild"], "schaden.jpg")],
        }}
        onTake={onTake}
        onDiscard={onDiscard}
      />,
    );
    const offer = screen.getByRole("region", { name: "Geteilt aus einer anderen App" });
    expect(offer.textContent).toContain("Schaden Bad");
    expect(offer.textContent).toContain("schaden.jpg");
    expect(onTake).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "In neue Mail übernehmen" }));
    expect(onTake).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(onDiscard).toHaveBeenCalledOnce();
  });
});
