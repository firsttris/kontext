import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mailbox } from "@/jmap/types";
import { FolderRow } from "./folder-menu";

const updateMailbox = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/jmap/folders", () => ({
  updateMailbox,
  deleteMailboxes: vi.fn(),
  markMailboxRead: vi.fn(),
}));
vi.mock("@/auth/auth", () => ({ useClient: () => ({}) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));

afterEach(() => {
  cleanup();
  updateMailbox.mockClear();
});

const box = (id: string, name: string, role: string | null, parentId: string | null): Mailbox => ({
  id,
  name,
  role,
  parentId,
  sortOrder: 0,
  totalEmails: 0,
  unreadEmails: 0,
});

const openMove = (mailbox: Mailbox, mailboxes: Mailbox[]) => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FolderRow accountId="acc" mailbox={mailbox} mailboxes={mailboxes} activeId={undefined}>
        <span>{mailbox.name}</span>
      </FolderRow>
    </QueryClientProvider>,
  );
  fireEvent.pointerDown(screen.getByRole("button", { name: `Ordnermenü „${mailbox.name}“` }), {
    pointerType: "mouse",
    button: 0,
  });
  fireEvent.click(screen.getByRole("menuitem", { name: "Verschieben" }));
  return screen.getByRole("combobox") as HTMLSelectElement;
};

describe("moving a folder", () => {
  // A folder under the Posteingang (made by another mail program): the Posteingang is no move
  // target, so the dialog must still show where the folder is, not "—" (the top level).
  it("shows a folder's current parent even when it is no move target", () => {
    const inbox = box("i", "Inbox", "inbox", null);
    const projects = box("p", "Projekte", null, "i");
    const other = box("k", "Kunden", null, null);
    const select = openMove(projects, [inbox, projects, other]);

    expect(select.value).toBe("i");
    fireEvent.change(select, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Verschieben" }));
    expect(updateMailbox).toHaveBeenCalledWith({}, "acc", "p", { parentId: null });
  });
});
