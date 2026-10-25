/**
 * A file that went into a chat, a task, an appointment or a contact opens for the people there:
 * Kontext shares it with them in Dokumente, to view (queries.ts shareDocument). Who that is:
 * lib/document-links.ts; for a shared mailbox's channel, board or address book its account id,
 * whose people only Kontext's server knows (it skips ids that are no shared mailbox).
 */
import { useCallback } from "react";
import { usePrincipals } from "@/features/sharing/queries";
import {
  type Card,
  channelMailboxes,
  channelReaders,
  eventReaders,
  taskReaders,
} from "@/lib/document-links";
import type { Channel } from "../../../server/chat/chat";
import { useShareDocument } from "./queries";

export const useShareWith = () => {
  const { data: principals = [] } = usePrincipals();
  const share = useShareDocument();

  /** The documents among a message's cards, with whoever reads the channel. */
  const channel = useCallback(
    (to: Pick<Channel, "kind" | "members" | "accountId">, cards: Card[]) => {
      const readers = channelReaders(to, principals);
      const mailboxes = channelMailboxes(to);
      for (const card of cards)
        if (card.kind === "document") void share(card.ref, readers, mailboxes);
    },
    [principals, share],
  );

  /** A document linked to a task, with whoever it is assigned to and the board's mailbox. */
  const task = useCallback(
    (assigneeId: string | null, fileId: string, boardId: string) =>
      void share(fileId, taskReaders(assigneeId, principals), [boardId]),
    [principals, share],
  );

  /** A document linked to a contact, with the shared mailbox whose address book has it. */
  const contact = useCallback(
    (accountId: string, fileId: string) => void share(fileId, [], [accountId]),
    [share],
  );

  /** The documents of an appointment, with the colleagues invited to it. */
  const event = useCallback(
    (attendees: string[], fileIds: string[]) => {
      const readers = eventReaders(attendees, principals);
      for (const fileId of fileIds) void share(fileId, readers);
    },
    [principals, share],
  );

  return { channel, task, event, contact };
};
