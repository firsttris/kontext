import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { EmailDetail } from "@/jmap/types";
import { usePrintMail } from "./print-mail";

const printPage = vi.fn(async (_html: string) => {});
vi.mock("@/components/print-frame", () => ({
  printPage: (html: string) => printPage(html),
}));
vi.mock("@/auth/auth", () => ({ useClient: () => ({}) }));
vi.mock("./queries", () => ({ useMailAccounts: () => [] }));

const newsletter = (html: string) =>
  ({
    subject: "Herbst-Angebote",
    from: [{ name: "Shop", email: "news@shop.test" }],
    to: [{ name: null, email: "jonas@weber-haustechnik.test" }],
    cc: null,
    receivedAt: "2026-10-24T12:46:00Z",
    htmlBody: [{ partId: "1", type: "text/html" }],
    textBody: [],
    attachments: [],
    bodyValues: { "1": { value: html } },
  }) as unknown as EmailDetail;

describe("usePrintMail", () => {
  it("keeps the mail's stylesheets off the printed head", async () => {
    // A newsletter's white heading on its coloured banner: on the printed page the subject
    // above the mail is an <h1> as well, on white paper.
    const mail = newsletter(
      `<html><head><style>h1 { color: #ffffff; }</style></head><body><h1>Angebote</h1></body></html>`,
    );
    const { result } = renderHook(() => usePrintMail());
    await result.current("a", mail);
    const page = printPage.mock.calls[0]![0];
    const parsed = new DOMParser().parseFromString(page, "text/html");
    document.documentElement.replaceWith(document.importNode(parsed.documentElement, true));
    const subject = document.querySelector("h1")!;
    expect(subject.textContent).toBe("Herbst-Angebote");
    expect(getComputedStyle(subject).color).not.toBe("rgb(255, 255, 255)");
  });
});
