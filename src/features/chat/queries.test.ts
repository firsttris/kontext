import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { Message } from "@/lib/chat";
import { addMessage, messagesKey, type Thread, threadKey } from "./queries";

const message = (id: string, text: string, parentId: string | null = null): Message => ({
  id,
  channelId: "c1",
  alsoInChannel: false,
  authorId: "jonas",
  text,
  mentions: [],
  files: [],
  cards: [],
  createdAt: "2026-10-29T13:00:00.000Z",
  editedAt: null,
  deleted: false,
  parentId,
  reactions: [],
  replies: null,
  call: null,
});

const channelTexts = (queryClient: QueryClient) =>
  queryClient
    .getQueryData<{ pages: { messages: Message[] }[] }>(messagesKey("c1"))
    ?.pages[0]?.messages.map((m) => m.id);

const loadedChannel = () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(messagesKey("c1"), {
    pages: [{ messages: [], hasMore: false, reads: {} }],
    pageParams: [null],
  });
  return queryClient;
};

describe("addMessage", () => {
  it("lets the live event of a sent message take the place of its pending copy", () => {
    const queryClient = loadedChannel();
    addMessage(queryClient, message("pending-1", "Fliesen kommen Donnerstag"));
    // The live event comes before the answer to the POST, which would name the pending id.
    addMessage(queryClient, message("m1", "Fliesen kommen Donnerstag"));
    expect(channelTexts(queryClient)).toEqual(["m1"]);
  });

  it("keeps a pending message that the live event of another message does not match", () => {
    const queryClient = loadedChannel();
    addMessage(queryClient, message("pending-1", "Fliesen kommen Donnerstag"));
    addMessage(queryClient, message("m0", "Passt"));
    expect(channelTexts(queryClient)?.sort()).toEqual(["m0", "pending-1"]);
  });

  it("lets the live event of a sent answer take the place of its pending copy in the thread", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<Thread>(threadKey("p1"), {
      message: message("p1", "Frage"),
      replies: [],
    });
    addMessage(queryClient, message("pending-1", "Antwort", "p1"));
    addMessage(queryClient, message("m1", "Antwort", "p1"));
    expect(queryClient.getQueryData<Thread>(threadKey("p1"))?.replies.map((m) => m.id)).toEqual([
      "m1",
    ]);
  });
});
