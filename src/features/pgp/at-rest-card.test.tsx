import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EncryptionAtRest } from "@/jmap/encryption-at-rest";
import { AtRestCard } from "./at-rest-card";

const atRest = vi.hoisted(() => ({ state: { "@type": "Disabled" } as EncryptionAtRest }));
vi.mock("@/jmap/encryption-at-rest", () => ({
  getEncryptionAtRest: async () => atRest.state,
  setEncryptionAtRest: async (_client: unknown, value: EncryptionAtRest) => {
    atRest.state = value;
  },
  registeredKeyId: async () => undefined,
  ensurePublicKey: async () => "k2",
}));
vi.mock("./queries", () => ({ useOwnKey: () => ({ data: null }) }));
vi.mock("@/auth/auth", () => ({ useClient: () => ({}) }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: () => {} }) }));
vi.mock("../settings/settings-page", () => ({
  SettingsCard: ({ children }: { children: unknown }) => <section>{children as never}</section>,
}));

const renderCard = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AtRestCard />
    </QueryClientProvider>,
  );

describe("encryption at rest without a key of one's own", () => {
  afterEach(cleanup);

  it("can still be switched off when the server encrypts for a key that is gone", async () => {
    // The key deleted elsewhere (another tab, an older Kontext): Stalwart still encrypts for it.
    atRest.state = { "@type": "Enabled", publicKey: "k1" };
    renderCard();
    const on = await screen.findByRole("switch", {
      name: "Mails auf dem Server verschlüsselt ablegen",
    });
    expect(on.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("alert").textContent).toMatch(/anderen Schlüssel/);
    fireEvent.click(on);
    await waitFor(() => expect(atRest.state).toEqual({ "@type": "Disabled" }));
  });

  it("asks for a key first when it is off", async () => {
    atRest.state = { "@type": "Disabled" };
    renderCard();
    await screen.findByText(/zuerst einen eigenen Schlüssel/);
    expect(screen.queryByRole("switch")).toBeNull();
  });
});
