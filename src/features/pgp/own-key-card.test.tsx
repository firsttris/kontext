import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EncryptionAtRest } from "@/jmap/encryption-at-rest";
import { OwnKeyCard } from "./own-key-card";

const calls = vi.hoisted(() => [] as string[]);
const atRest = vi.hoisted(() => ({ state: { "@type": "Disabled" } as EncryptionAtRest }));
const refuse = vi.hoisted(() => ({ off: false }));
vi.mock("@/jmap/encryption-at-rest", () => ({
  getEncryptionAtRest: async () => atRest.state,
  setEncryptionAtRest: async (_client: unknown, value: EncryptionAtRest) => {
    if (refuse.off) throw new Error("Stalwart sagt nein");
    calls.push(`at-rest ${value["@type"]}`);
    atRest.state = value;
  },
  forgetPublicKey: async (_client: unknown, fingerprint: string) =>
    void calls.push(`forget ${fingerprint}`),
}));
vi.mock("./queries", () => ({
  useOwnKey: () => ({
    isPending: false,
    data: { email: "sandra@w.test", fingerprint: "abcd", publicKey: "pub" },
  }),
  usePgpActions: () => ({ removeOwn: async () => void calls.push("remove key") }),
  keepUnlocked: () => {},
}));
vi.mock("@/auth/auth", () => ({ useClient: () => ({}) }));
vi.mock("@/components/shell/app-shell", () => ({ useSession: () => ({ data: null }) }));
vi.mock("../mail/use-send-account", () => ({ useSendAccount: () => ({ myName: "" }) }));
vi.mock("../settings/queries", () => ({ usePersonalAccountId: () => "a" }));
const show = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show }) }));

const renderCard = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OwnKeyCard />
    </QueryClientProvider>,
  );

const deleteKey = () => fireEvent.click(screen.getByRole("button", { name: "Schlüssel löschen" }));

describe("deleting one's own key", () => {
  beforeEach(() => {
    calls.length = 0;
    refuse.off = false;
    show.mockClear();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("first stops the server encrypting new mails for it", async () => {
    // Otherwise Stalwart goes on encrypting every new mail for a key nobody holds any more.
    atRest.state = { "@type": "Enabled", publicKey: "k1" };
    renderCard();
    deleteKey();
    await waitFor(() =>
      expect(calls).toEqual(["at-rest Disabled", "forget abcd", "remove key"]),
    );
  });

  it("keeps the key when the server cannot be switched off", async () => {
    atRest.state = { "@type": "Enabled", publicKey: "k1" };
    refuse.off = true;
    renderCard();
    deleteKey();
    await waitFor(() =>
      expect(show).toHaveBeenCalledWith(expect.stringContaining("Stalwart sagt nein"), "error"),
    );
    expect(calls).toEqual([]);
  });

  it("takes its registration off the server, also when it does not encrypt", async () => {
    // Stalwart keeps at most 5 public keys per account (crates/registry/src/schema/structs_impl.rs,
    // `max_public_keys: Some(5u64)`): without this, the sixth new key could not be switched on.
    atRest.state = { "@type": "Disabled" };
    renderCard();
    deleteKey();
    await waitFor(() => expect(calls).toEqual(["forget abcd", "remove key"]));
  });
});
