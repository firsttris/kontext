// @vitest-environment node
// Node's Response reads Node's Blob; jsdom's has no stream().
import PostalMime from "postal-mime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoServer } from "./server";
import { createStore } from "./store";

const ORIGIN = "https://demo.test";

// The server looks at held mails every second; that is not what is tested here.
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("download", () => {
  it("gives a seed mail as the message it is, for “Als .eml speichern”", async () => {
    const store = { ...createStore(), user: "jonas" };
    const serve = createDemoServer(store, ORIGIN);
    const mail = [...store.emails.values()].find(
      (email) => email.subject === "Lieferschein 48211",
    )!;
    // The session's downloadUrl (RFC 8620 §6.2), filled in as the app does.
    const response = await serve(
      new Request(`${ORIGIN}/jmap/download/jonas/${mail.blobId}/x.eml?accept=message/rfc822`),
    );
    expect(response?.status).toBe(200);
    const message = await PostalMime.parse(await response!.arrayBuffer());
    expect(message.subject).toBe("Lieferschein 48211");
    expect(message.from?.address).toBe("bestellung@richter-sanitaer.test");
    expect(message.text).toContain("anbei der Lieferschein");
    expect(message.attachments.map((file) => file.filename)).toEqual(["winmail.dat"]);
  });
});
