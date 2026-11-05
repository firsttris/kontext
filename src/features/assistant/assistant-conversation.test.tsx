import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

describe("the assistant's conversation across sign-ins and empty answers", () => {
  it("is gone after signing out, as everything the app cleared from its query cache", async () => {
    server(
      Response.json({
        text: "Keller Elektro hat am Montag geschrieben.",
        done: [],
        incomplete: false,
      }),
    );
    const queryClient = new QueryClient();
    const withCache = () => (
      <QueryClientProvider client={queryClient}>
        <AssistantConversation />
      </QueryClientProvider>
    );
    render(withCache());
    ask("Was gab es zuletzt mit Keller Elektro?");
    expect(await screen.findByText("Keller Elektro hat am Montag geschrieben.")).toBeTruthy();
    cleanup();
    // What src/main.tsx does when someone signs out or another person signs in.
    queryClient.clear();
    render(withCache());
    expect(screen.queryByText("Keller Elektro hat am Montag geschrieben.")).toBeNull();
    expect(screen.queryByText("Was gab es zuletzt mit Keller Elektro?")).toBeNull();
  });

  it("goes on after an answer without text (the server takes no empty turn)", async () => {
    const sent = server(
      Response.json({ text: "", done: ["Aufgabe „Angebot Keller“ angelegt."], incomplete: true }),
      Response.json({ text: "Erledigt.", done: [], incomplete: false }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AssistantConversation />
      </QueryClientProvider>,
    );
    ask("Leg eine Aufgabe für das Angebot an Keller an.");
    expect(await screen.findByText("Aufgabe „Angebot Keller“ angelegt.")).toBeTruthy();
    ask("Und trag sie für Freitag ein.");
    expect(await screen.findByText("Erledigt.")).toBeTruthy();
    const { messages } = sent[1] as { messages: { role: string; text: string }[] };
    // server/assistant/routes.ts: every turn's text has at least one character, else 400.
    expect(messages.filter((turn) => turn.text.trim() === "")).toEqual([]);
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
