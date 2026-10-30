// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Grants } from "../auth";
import { readEnv } from "../env";
import { createMailWatch, mailNotices, type NewMail } from "./mail-watch";

const mail = (id: string, receivedAt: string, seen = false): NewMail => ({
  id,
  subject: `Betreff ${id}`,
  from: [{ name: "Markus Hoffmann", email: "markus@hoffmann.test" }],
  receivedAt,
  keywords: seen ? { $seen: true } : {},
});

describe("mailNotices", () => {
  const since = "2026-10-24T10:00:00Z";

  it("tells of unread mails that came after the last look, the newest first", () => {
    const notices = mailNotices(
      [
        mail("a", "2026-10-24T09:59:00Z"),
        mail("b", "2026-10-24T10:01:00Z"),
        mail("c", "2026-10-24T10:02:00Z", true),
        mail("d", "2026-10-24T10:03:00Z"),
      ],
      "jonas",
      since,
    );
    expect(notices).toEqual([
      {
        title: "Neue Mail von Markus Hoffmann",
        body: "Betreff d",
        url: "/mail/jonas/inbox?email=d",
        tag: "mail-d",
      },
      expect.objectContaining({ tag: "mail-b" }),
    ]);
  });

  it("puts many at once into one notification", () => {
    const many = ["1", "2", "3", "4"].map((id) => mail(id, `2026-10-24T10:0${id}:00Z`));
    expect(mailNotices(many, "info", since)).toEqual([
      { title: "4 neue Mails", body: "", url: "/mail/info/inbox", tag: "mail-info" },
    ]);
  });
});

describe("createMailWatch", () => {
  const env = readEnv({
    BETTER_AUTH_SECRET: "x".repeat(48),
    BETTER_AUTH_URL: "https://kontext.test",
    STALWART_URL: "http://stalwart:8080",
  });
  const watchFor = (token: string | null) => {
    const grants = { accessToken: vi.fn(async () => token), forget: vi.fn(async () => undefined) };
    const watch = createMailWatch({
      env,
      grants: grants as unknown as Grants,
      store: {
        subscribers: async () => [{ memberId: "jonas", sessionId: "s1" }],
        mailboxesOff: async () => [],
      },
      pusher: { notify: async () => undefined },
    });
    return { grants, watch };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("stops for a token Stalwart refuses, forgets the grant and does not ask again", async () => {
    const fetch = vi.fn(async () => new Response("Unauthorized", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { grants, watch } = watchFor("refused");
    await watch.refresh();
    await vi.waitFor(() => expect(grants.forget).toHaveBeenCalledWith("s1"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetch).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
    watch.stop();
  });

  it("does not ask Stalwart without a grant", async () => {
    const fetch = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { grants, watch } = watchFor(null);
    await watch.refresh();
    await vi.waitFor(() => expect(grants.accessToken).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetch).not.toHaveBeenCalled();
    watch.stop();
  });
});
