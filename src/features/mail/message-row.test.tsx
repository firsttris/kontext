import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailSummary } from "@/jmap/types";
import type { PhotoKey } from "@/lib/photo";
import type { SwipeAction } from "@/lib/swipe";
import { MessageRow } from "./message-row";
import { useSwipeAction } from "./swipe-action";
import type { Group } from "./use-thread-info";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to: _to,
    search: _search,
    ...props
  }: {
    children: ReactNode;
    to?: unknown;
    search?: unknown;
  }) => (
    <a href="/mail" {...props}>
      {children}
    </a>
  ),
  useParams: () => ({ accountId: "a1" }),
}));
vi.mock("@/components/use-media-query", () => ({ useMediaQuery: () => false }));
vi.mock("../categories/queries", () => ({ useCategoryMap: () => ({}) }));
const hint = vi.hoisted(() => ({ inside: null as string[] | null }));
vi.mock("@/features/company/external-hint", () => ({ useInsideDomains: () => hint.inside }));
vi.mock("../tasks/queries", () => ({ useTasks: () => ({ tasks: [] }) }));
vi.mock("./opened-mails", () => ({
  useShownSubject: (email: { subject: string | null }) => email.subject,
  useOpenedPreview: () => undefined,
}));
const actions = vi.hoisted(() => ({
  setSeen: vi.fn(async () => undefined),
  setFlagged: vi.fn(async () => undefined),
  archive: vi.fn(async () => undefined),
  remove: vi.fn(async () => undefined),
}));
vi.mock("./actions", () => ({ useMailActions: () => actions }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));

const mail = (keywords: Record<string, boolean> = {}): EmailSummary => ({
  id: "e1",
  threadId: "t1",
  mailboxIds: { inbox: true },
  keywords,
  from: [{ name: "Anna Weber", email: "anna@weber-haustechnik.test" }],
  to: null,
  subject: "Angebot Bad",
  receivedAt: "2026-10-28T09:00:00Z",
  preview: "Hallo",
  hasAttachment: false,
  size: 100,
});

const WIDTH = 390;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: WIDTH,
  } as DOMRect);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const action of Object.values(actions)) action.mockClear();
});

const touch = { pointerType: "touch", isPrimary: true, pointerId: 1 };
const line = () => screen.getByRole("link");
/** A finger put down on the line and drawn sideways by `by`, in steps; not yet lifted. */
const drag = (by: number) => {
  fireEvent.pointerDown(line(), { ...touch, clientX: 200, clientY: 40 });
  for (let step = 1; step <= 10; step++)
    fireEvent.pointerMove(line(), { ...touch, clientX: 200 + (by * step) / 10, clientY: 40 });
};
const lift = (by: number) =>
  fireEvent.pointerUp(line(), { ...touch, clientX: 200 + by, clientY: 40 });

const Row = ({
  email,
  group,
  onPick = () => undefined,
  onSwipe,
  showRecipient = false,
  selected = false,
  photoOf = () => undefined,
}: {
  email: EmailSummary;
  group?: Group;
  onPick?: () => void;
  onSwipe?: (action: SwipeAction) => void;
  showRecipient?: boolean;
  selected?: boolean;
  photoOf?: (person: PhotoKey) => string | undefined;
}) => {
  // Wired as list-frame.tsx wires it.
  const swipe = useSwipeAction("inbox");
  return (
    <MessageRow
      row={{ email }}
      active={false}
      showRecipient={showRecipient}
      isDraft={false}
      drag={undefined}
      selecting={selected}
      selected={selected}
      onPick={onPick}
      group={group}
      photoOf={photoOf}
      onSwipe={onSwipe ?? ((action) => swipe("a1", email, action, group))}
    />
  );
};

describe("MessageRow swiped on the phone", () => {
  it("does not also swipe away a mail a long press just picked", () => {
    vi.useFakeTimers();
    const onPick = vi.fn();
    const onSwipe = vi.fn();
    render(<Row email={mail({ $seen: true })} onPick={onPick} onSwipe={onSwipe} />);
    fireEvent.pointerDown(line(), { ...touch, clientX: 200, clientY: 40 });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(onPick).toHaveBeenCalledOnce();
    // Still holding, the finger then slides sideways and lets go.
    for (let step = 1; step <= 10; step++)
      fireEvent.pointerMove(line(), { ...touch, clientX: 200 - 25 * step, clientY: 40 });
    lift(-250);
    expect(onSwipe).not.toHaveBeenCalled();
  });

  it("opens the line with the keyboard after a swipe that sent no click", () => {
    render(<Row email={mail({ $seen: true })} onSwipe={() => undefined} />);
    drag(-60);
    lift(-60);
    // Enter on the focused link: a click without a pointer before it (detail 0).
    const opened = fireEvent.click(line(), { detail: 0 });
    expect(opened).toBe(true);
  });

  it("marks a conversation shown as unread read, as the sign under the line says", async () => {
    const email = mail({ $seen: true });
    render(
      <Row
        email={email}
        group={{ count: 2, names: ["Anna", "Jonas"], unread: true, unreadIds: ["e0"] }}
      />,
    );
    drag(250);
    expect(screen.getByText("Als gelesen markieren")).toBeTruthy();
    lift(250);
    await act(async () => undefined);
    expect(actions.setSeen).toHaveBeenCalledOnce();
    expect(actions.setSeen.mock.calls[0]).toEqual(["a1", ["e0"], true]);
  });
});

describe("MessageRow from outside the company", () => {
  afterEach(() => {
    hint.inside = null;
  });
  const outside = { ...mail(), from: [{ name: "Kunde", email: "kunde@example.test" }] };

  it("carries the mark „Extern“ while the hint is on", () => {
    hint.inside = ["weber-haustechnik.test"];
    render(<Row email={outside} />);
    expect(screen.getByText("Extern")).toBeTruthy();
  });

  it("has no mark for colleagues, nor while the hint is off", () => {
    hint.inside = ["weber-haustechnik.test"];
    render(<Row email={mail()} />);
    expect(screen.queryByText("Extern")).toBeNull();
    cleanup();
    hint.inside = null;
    render(<Row email={outside} />);
    expect(screen.queryByText("Extern")).toBeNull();
  });
});

describe("MessageRow's picture", () => {
  const PHOTO = "data:image/png;base64,iVBORw0KGgo=";
  const photos = (email: string) => (person: PhotoKey) =>
    person.email === email ? PHOTO : undefined;
  const picture = (container: HTMLElement) => container.querySelector(`img[src="${PHOTO}"]`);

  it("shows the sender's photo, and the box to pick it stays", () => {
    const onPick = vi.fn();
    const { container } = render(
      <Row email={mail()} onPick={onPick} photoOf={photos("anna@weber-haustechnik.test")} />,
    );
    expect(picture(container)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onPick).toHaveBeenCalledOnce();
  });

  it("shows the initials when there is no photo", () => {
    const { container } = render(<Row email={mail()} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("AW")).toBeTruthy();
  });

  it("gives a forged sender no colleague's photo", () => {
    const forged = {
      ...mail(),
      "header:Authentication-Results:asText:all": [
        "mx.weber-haustechnik.test; dmarc=fail header.from=weber-haustechnik.test",
      ],
    };
    const { container } = render(
      <Row email={forged} photoOf={photos("anna@weber-haustechnik.test")} />,
    );
    expect(picture(container)).toBeNull();
  });

  it("shows the first recipient in a list of sent mails", () => {
    const sent = { ...mail(), to: [{ name: "Kunde", email: "kunde@example.test" }] };
    const { container } = render(
      <Row email={sent} showRecipient photoOf={photos("kunde@example.test")} />,
    );
    expect(picture(container)).toBeTruthy();
  });

  it("shows the latest sender of a conversation", () => {
    const latest = { ...mail(), id: "e2", from: [{ name: "Kunde", email: "kunde@example.test" }] };
    const { container } = render(
      <Row
        email={mail()}
        group={{ count: 2, names: ["Anna", "Kunde"], unread: false, unreadIds: [], latest }}
        photoOf={photos("kunde@example.test")}
      />,
    );
    expect(picture(container)).toBeTruthy();
  });

  it("shows only the box while picking", () => {
    const { container } = render(
      <Row email={mail()} selected photoOf={photos("anna@weber-haustechnik.test")} />,
    );
    expect(picture(container)).toBeNull();
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });
});
