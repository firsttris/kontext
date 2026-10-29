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
const changeFollowing = vi.fn(async () => {});
const updateEvent = vi.fn(async () => {});
vi.mock("./split-series", () => ({
  useSplitSeries: () => ({ changeFollowing, endBeforeDate: vi.fn(), isPending: false }),
}));
vi.mock("./place-queries", () => ({ usePlaceSuggestions: () => [] }));
const refs = vi.hoisted(() => ({ calendars: [] as unknown[] }));
const createEvent = vi.fn(async (_input: { event: Record<string, unknown> }) => {});
vi.mock("./queries", () => ({
  calendarLabel: () => "Kalender",
  useCalendarRefs: () => refs,
  useEventMutations: () => ({
    create: { mutateAsync: createEvent, isPending: false },
    update: { mutateAsync: updateEvent, isPending: false },
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

describe("EventEditor times", () => {
  it("moves the end with the start, keeping the length", () => {
    render(<EventEditor start="2026-10-31T09:00" onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Beginn Uhrzeit"), { target: { value: "17:30" } });
    expect((screen.getByLabelText("Ende Uhrzeit") as HTMLInputElement).value).toBe("18:30");
  });

  // A date field reports "" while a part of it is retyped (Backspace in Chrome).
  it("moves the end date after the start date was empty for a moment", () => {
    render(<EventEditor start="2026-10-31T09:00" onDone={vi.fn()} onCancel={vi.fn()} />);
    const date = screen.getByLabelText("Beginn Datum");
    fireEvent.change(date, { target: { value: "" } });
    fireEvent.change(date, { target: { value: "2026-11-02" } });
    expect((screen.getByLabelText("Ende Datum") as HTMLInputElement).value).toBe("2026-11-02");
  });
});

describe("EventEditor reminder", () => {
  it("offers how long before and how, and keeps a reminder when it becomes all-day", () => {
    render(<EventEditor start="2026-10-31T09:00" onDone={vi.fn()} onCancel={vi.fn()} />);
    const when = screen.getByLabelText("Erinnerung") as HTMLSelectElement;
    expect(when.selectedOptions[0]?.textContent).toBe("15 Minuten vorher");
    fireEvent.change(when, { target: { value: "1440" } });
    fireEvent.change(screen.getByLabelText("Erinnern per"), { target: { value: "email" } });
    expect(when.selectedOptions[0]?.textContent).toBe("1 Tag vorher");
    fireEvent.click(screen.getByLabelText("Ganztägig"));
    expect(
      [...(screen.getByLabelText("Erinnerung") as HTMLSelectElement).options].map(
        (option) => option.textContent,
      ),
    ).toEqual(["Keine", "Am Tag", "1 Tag vorher", "2 Tage vorher", "1 Woche vorher"]);
    expect((screen.getByLabelText("Erinnern per") as HTMLSelectElement).value).toBe("email");
    fireEvent.change(screen.getByLabelText("Erinnerung"), { target: { value: "none" } });
    expect(screen.queryByLabelText("Erinnern per")).toBeNull();
  });
});

describe("EventEditor series", () => {
  const series = {
    id: "s",
    accountId: "a",
    calendarIds: { c: true },
    title: "Teambesprechung",
    start: "2026-11-02T10:00:00",
    timeZone: "Europe/Berlin",
    duration: "PT1H",
    recurrenceRule: { "@type": "RecurrenceRule" as const, frequency: "weekly" as const, count: 10 },
  };
  const date = (recurrenceId: string) => ({
    ...series,
    id: `i-${recurrenceId}`,
    baseEventId: "s",
    recurrenceId,
    start: recurrenceId,
    recurrenceRule: undefined,
  });

  it("starts a new series from this date with the changes", async () => {
    const instance = date("2026-11-16T10:00:00");
    render(<EventEditor event={instance} series={series} onDone={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("Dieser und alle folgenden"));
    // The rule of the series is there to change, as for the whole series.
    expect(screen.getByLabelText("Wiederholen")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Jour fixe" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    });
    expect(changeFollowing).toHaveBeenCalledWith(
      instance,
      series,
      expect.objectContaining({
        title: "Jour fixe",
        start: "2026-11-16T10:00:00",
        recurrenceRule: expect.objectContaining({ frequency: "weekly", count: 10 }),
      }),
    );
  });

  it("changes the whole series when it is its first date", async () => {
    changeFollowing.mockClear();
    updateEvent.mockClear();
    render(
      <EventEditor
        event={date("2026-11-02T10:00:00")}
        series={series}
        onDone={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Dieser und alle folgenden"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    });
    expect(changeFollowing).not.toHaveBeenCalled();
    expect(updateEvent).toHaveBeenCalledWith(expect.objectContaining({ id: "s" }));
  });
});

describe("EventEditor reminder of a new appointment", () => {
  const dayBefore = {
    reminder: {
      "@type": "Alert",
      trigger: { "@type": "OffsetTrigger", offset: "-P1D", relativeTo: "start" },
      action: "email",
    },
  };
  const onTheDay = {
    reminder: {
      "@type": "Alert",
      trigger: { "@type": "OffsetTrigger", offset: "PT9H", relativeTo: "start" },
      action: "display",
    },
  };
  afterEach(() => {
    refs.calendars = [];
    createEvent.mockClear();
  });

  it("takes the calendar's default reminder, for times and all day", async () => {
    refs.calendars = [
      {
        key: "a/1",
        accountId: "a",
        isPersonal: true,
        mayWrite: true,
        calendar: {
          id: "1",
          isDefault: true,
          defaultAlertsWithTime: dayBefore,
          defaultAlertsWithoutTime: onTheDay,
        },
      },
    ];
    render(<EventEditor start="2026-11-02T09:00" onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Erinnerung")).toHaveProperty("value", "1440");
    expect(screen.getByLabelText("Erinnern per")).toHaveProperty("value", "email");
    fireEvent.click(screen.getByLabelText("Ganztägig"));
    expect(screen.getByLabelText("Erinnerung")).toHaveProperty("value", "-540");
    fireEvent.click(screen.getByLabelText("Ganztägig"));
    fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Abnahme" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    });
    expect(createEvent.mock.calls[0]?.[0].event.alerts).toEqual({
      reminder: {
        "@type": "Alert",
        trigger: { "@type": "OffsetTrigger", offset: "-P1D", relativeTo: "start" },
        action: "email",
      },
    });
  });

  it("keeps the usual 15 minutes without a default, and what was picked", async () => {
    refs.calendars = [
      {
        key: "a/1",
        accountId: "a",
        isPersonal: true,
        mayWrite: true,
        calendar: { id: "1", isDefault: true, defaultAlertsWithTime: {} },
      },
    ];
    render(<EventEditor start="2026-11-02T09:00" onDone={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByLabelText("Erinnerung")).toHaveProperty("value", "15");
    fireEvent.change(screen.getByLabelText("Erinnerung"), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Titel"), { target: { value: "Abnahme" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    });
    expect(createEvent.mock.calls[0]?.[0].event.alerts).toMatchObject({
      reminder: { trigger: { offset: "-PT1H" }, action: "display" },
    });
  });
});
