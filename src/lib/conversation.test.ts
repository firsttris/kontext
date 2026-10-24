import { describe, expect, it } from "vitest";
import {
  answeredBy,
  aroundMail,
  personOf,
  splitQuote,
  splitTextQuote,
  type ThreadMail,
} from "./conversation";

const mail = (
  id: string,
  receivedAt: string,
  mailboxIds: Record<string, boolean>,
  over: Partial<ThreadMail> = {},
): ThreadMail => ({
  id,
  receivedAt,
  mailboxIds,
  keywords: {},
  from: [{ name: "Markus Hoffmann", email: "m@hoffmann.test" }],
  subject: "Badsanierung",
  preview: "",
  ...over,
});

describe("aroundMail", () => {
  const thread = [
    mail("a", "2026-10-20T08:00:00Z", { inbox: true }),
    mail("b", "2026-10-21T08:00:00Z", { sent: true }),
    mail("c", "2026-10-22T08:00:00Z", { inbox: true }),
    mail("d", "2026-10-23T08:00:00Z", { trash: true }),
    mail("e", "2026-10-24T08:00:00Z", { drafts: true }, { keywords: { $draft: true } }),
    mail("f", "2026-10-24T09:00:00Z", { sent: true }),
  ];

  it("splits the conversation at the mail being read, without trash and drafts", () => {
    const { earlier, later } = aroundMail(thread, thread[2]!, ["trash"]);
    expect(earlier.map((m) => m.id)).toEqual(["a", "b"]);
    expect(later.map((m) => m.id)).toEqual(["f"]);
  });
});

describe("answeredBy", () => {
  it("names the colleague of the latest answer from the Sent folder", () => {
    const thread = [
      mail("q", "2026-10-20T08:00:00Z", { inbox: true }),
      mail(
        "r1",
        "2026-10-20T09:00:00Z",
        { sent: true },
        { from: [{ name: "Jonas Weber (Weber Haustechnik)", email: "info@w.test" }] },
      ),
      mail(
        "r2",
        "2026-10-21T14:02:00Z",
        { sent: true },
        { from: [{ name: "Anna Weber (Weber Haustechnik)", email: "info@w.test" }] },
      ),
    ];
    expect(answeredBy(thread, thread[0]!, "sent")).toEqual({
      name: "Anna Weber",
      at: "2026-10-21T14:02:00Z",
    });
    expect(answeredBy(thread, thread[2]!, "sent")).toBeNull();
    expect(answeredBy(thread, thread[0]!, undefined)).toBeNull();
    expect(personOf("Weber Haustechnik")).toBe("Weber Haustechnik");
  });
});

describe("splitQuote", () => {
  it("folds Kontext's own quote with its line", () => {
    const html =
      "<p>Passt, danke!</p><p></p><p>Am 24.10.2026 um 09:31 schrieb Markus Hoffmann:</p><blockquote><p>Die Fliesen gefallen uns.</p></blockquote>";
    const { main, quote } = splitQuote(html);
    expect(main).toBe("<p>Passt, danke!</p><p></p>");
    expect(quote).toContain("schrieb Markus Hoffmann");
    expect(quote).toContain("Die Fliesen gefallen uns.");
  });

  it("knows Gmail's and Outlook's quotes", () => {
    expect(
      splitQuote(
        '<div>Ok</div><div class="gmail_quote"><div>On Mon wrote:</div><blockquote>x</blockquote></div>',
      ).main,
    ).toBe("<div>Ok</div>");
    const outlook = splitQuote(
      '<p>Gerne.</p><hr><div id="divRplyFwdMsg"><b>Von:</b> Hoffmann</div><div>Alt</div>',
    );
    expect(outlook.main).toBe("<p>Gerne.</p>");
    expect(outlook.quote).toContain("<hr>");
    expect(outlook.quote).toContain("Alt");
  });

  it("leaves mails without a quote, or with nothing but one, as they are", () => {
    expect(splitQuote("<p>Hallo</p>").quote).toBeNull();
    expect(splitQuote("<blockquote>nur weitergeleitet</blockquote>").quote).toBeNull();
  });
});

describe("splitTextQuote", () => {
  it("folds from the attribution line or the first quoted line", () => {
    const text = "Danke!\n\nAm 24.10. schrieb Markus Hoffmann:\n> Die Fliesen\n> gefallen uns.";
    expect(splitTextQuote(text)).toEqual({
      main: "Danke!",
      quote: "Am 24.10. schrieb Markus Hoffmann:\n> Die Fliesen\n> gefallen uns.",
    });
    expect(splitTextQuote("Ok\n> alt").main).toBe("Ok");
    expect(splitTextQuote("Nur Text").quote).toBeNull();
  });
});
