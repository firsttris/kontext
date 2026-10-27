import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";
import { EventEditor } from "./event-editor";

const anna = { name: "Anna Weber", email: "anna@weber.test" };

vi.mock("@/components/shell/app-shell", () => ({
  useSession: () => ({ data: { username: "jonas@weber.test" } }),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));
vi.mock("@/features/calls/meeting-field", () => ({ MeetingField: () => null }));
vi.mock("@/features/documents/document-actions", () => ({ EventDocuments: () => null }));
vi.mock("@/features/documents/use-share-with", () => ({
  useShareWith: () => ({ event: vi.fn() }),
}));
vi.mock("@/features/contacts/use-suggestions", () => ({
  useAddressSuggestions: () => [anna],
}));
vi.mock("./availability-panel", () => ({ AvailabilityPanel: () => null }));
vi.mock("./queries", () => ({
  calendarLabel: () => "Kalender",
  useCalendarRefs: () => ({ calendars: [] }),
  useEventMutations: () => ({
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn(), isPending: false },
  }),
  useMyAddresses: () => ["jonas@weber.test"],
}));

afterEach(cleanup);

describe("EventEditor attendees", () => {
  it("keeps the name typed with an address on its chip", () => {
    render(<EventEditor start="2026-11-02T09:00" onDone={vi.fn()} onCancel={vi.fn()} />);
    const field = screen.getByRole("combobox", { name: "Teilnehmer" });
    fireEvent.change(field, { target: { value: "Petra Keller <petra@keller.test>" } });
    act(() => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    // The composer shows "Petra Keller" for the same input; the attendee chip drops the name.
    expect(screen.getByTitle("petra@keller.test").textContent).toContain("Petra Keller");
  });

  it("Escape closes the open suggestion list, not the appointment dialog", () => {
    const onOpenChange = vi.fn();
    render(
      <Dialog open onOpenChange={onOpenChange} title="Neuer Termin">
        <EventEditor start="2026-11-02T09:00" onDone={vi.fn()} onCancel={vi.fn()} />
      </Dialog>,
    );
    const field = screen.getByRole("combobox", { name: "Teilnehmer" });
    fireEvent.change(field, { target: { value: "ann" } });
    expect(screen.getByRole("option", { name: /Anna Weber/ })).toBeTruthy();
    fireEvent.keyDown(field, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
