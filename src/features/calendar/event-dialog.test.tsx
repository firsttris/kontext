import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CalendarEvent } from "@/lib/jscalendar";
import { EventDialog } from "./event-dialog";

type Search = Record<string, string | undefined>;
const navigate = vi.fn((_options: { search: (prev: Search) => Search }) => Promise.resolve());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("./queries", () => ({ useSeries: () => ({ data: undefined, isPending: false }) }));
const details = vi.hoisted(() => ({ onDone: undefined as (() => void) | undefined }));
vi.mock("./event-details", () => ({
  EventDetails: (props: { onDone: () => void }) => {
    details.onDone = props.onDone;
    return null;
  },
}));
vi.mock("./event-editor", () => ({ EventEditor: () => null }));

afterEach(cleanup);

describe("EventDialog", () => {
  it("leaves an appointment opened meanwhile open when a deletion finishes late", async () => {
    const event = { id: "first", title: "Wochenrunde" } as CalendarEvent;
    render(<EventDialog eventId="first" event={event} />);
    // "Nur diesen Termin löschen": the refetch drops the date and the dialog with it; the user
    // opens the next date before the mutation resolves and `onDone` closes the dialog.
    await act(async () => details.onDone?.());
    const { search } = navigate.mock.calls.at(-1)![0];
    expect(search({ view: "agenda", event: "third", account: "d" })).toEqual({
      view: "agenda",
      event: "third",
      account: "d",
    });
    expect(search({ view: "agenda", event: "first", account: "d" })).toEqual({
      view: "agenda",
      event: undefined,
      account: "d",
      start: undefined,
    });
  });
});
