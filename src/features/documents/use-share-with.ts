/**
 * A file that went into a chat, a task or an appointment opens for the people there: Kontext shares
 * it with them in Dokumente, to view (queries.ts shareDocument). Who that is: lib/document-links.ts.
 */
import { useCallback } from "react";
import { usePrincipals } from "@/features/sharing/queries";
import { type Card, channelReaders, eventReaders, taskReaders } from "@/lib/document-links";
import type { Channel } from "../../../server/chat/chat";
import { useShareDocument } from "./queries";

export const useShareWith = () => {
  const { data: principals = [] } = usePrincipals();
  const share = useShareDocument();

  /** The documents among a message's cards, with whoever reads the channel. */
  const channel = useCallback(
    (to: Pick<Channel, "kind" | "members">, cards: Card[]) => {
      const readers = channelReaders(to, principals);
      for (const card of cards) if (card.kind === "document") void share(card.ref, readers);
    },
    [principals, share],
  );

  /** A document linked to a task, with whoever it is assigned to. */
  const task = useCallback(
    (assigneeId: string | null, fileId: string) =>
      void share(fileId, taskReaders(assigneeId, principals)),
    [principals, share],
  );

  /** The documents of an appointment, with the colleagues invited to it. */
  const event = useCallback(
    (attendees: string[], fileIds: string[]) => {
      const readers = eventReaders(attendees, principals);
      for (const fileId of fileIds) void share(fileId, readers);
    },
    [principals, share],
  );

  return { channel, task, event };
};
