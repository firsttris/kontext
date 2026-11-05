import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AssistantConversation, turnsOf } from "./assistant-conversation";

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/use-back", () => ({ useBack: () => vi.fn() }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** The server's answers in turn, keeping what the app sent. */
const server = (...answers: Response[]) => {
  const sent: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return answers.shift() ?? new Response(null, { status: 500 });
    }),
  );
  return sent;
};

const ask = (text: string) => {
  fireEvent.change(screen.getByRole("textbox", { name: "Frage an den Assistenten" }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "Senden" }));
};

describe("the assistant's conversation", () => {
  it("shows the answer and what the assistant created", async () => {
    const sent = server(
      Response.json({
        text: "Der Entwurf an Frau Keller liegt bereit.",
        done: ["Entwurf an petra@keller.test liegt in „Entwürfe“."],
        incomplete: false,
      }),
    );
    render(<AssistantConversation />);
    ask("Schreib Frau Keller, dass wir Dienstag kommen.");
    expect(await screen.findByText("Der Entwurf an Frau Keller liegt bereit.")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Angelegt" }).textContent).toContain(
      "Entwurf an petra@keller.test",
    );
    expect(sent).toEqual([
      { messages: [{ role: "user", text: "Schreib Frau Keller, dass wir Dienstag kommen." }] },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Neues Gespräch/ }));
    expect(screen.queryByText("Der Entwurf an Frau Keller liegt bereit.")).toBeNull();
  });

  it("says when there were too many questions, and leaves the failed try out next time", async () => {
    const sent = server(
      new Response(null, { status: 429 }),
      Response.json({ text: "Ja.", done: [], incomplete: false }),
    );
    render(<AssistantConversation />);
    ask("Erste");
    expect(await screen.findByText(/Zu viele Fragen/)).toBeTruthy();
    ask("Zweite");
    expect(await screen.findByText("Ja.")).toBeTruthy();
    expect(sent[1]).toEqual({
      messages: [
        { role: "user", text: "Erste" },
        { role: "user", text: "Zweite" },
      ],
    });
  });
});

describe("the turns sent to the server", () => {
  it("keep questions and answers, without failures or what was created", () => {
    expect(
      turnsOf([
        { role: "user", text: "A" },
        { role: "assistant", text: "", failure: "failed" },
        { role: "user", text: "B" },
        { role: "assistant", text: "C", done: ["x"], incomplete: true },
      ]),
    ).toEqual([
      { role: "user", text: "A" },
      { role: "user", text: "B" },
      { role: "assistant", text: "C" },
    ]);
  });
});
