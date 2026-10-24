/** The names the chat shows: of the people, of the channels, and who one is oneself. */
import { useCallback, useMemo } from "react";
import { useMailAccounts } from "@/features/mail/queries";
import { useMe, usePeople } from "@/features/tasks/queries";
import { type Channel, channelTitle } from "@/lib/chat";
import { m } from "@/paraglide/messages";

export const useChatNames = () => {
  const me = useMe();
  const people = usePeople();
  const accounts = useMailAccounts();
  const byId = useMemo(() => new Map(people.map((person) => [person.id, person.name])), [people]);
  const nameOf = useCallback((id: string) => byId.get(id) ?? m.chat_someone(), [byId]);
  const accountName = useCallback(
    (id: string) => accounts.find((account) => account.id === id)?.name ?? "",
    [accounts],
  );
  const titleOf = useCallback(
    (channel: Pick<Channel, "kind" | "name" | "accountId" | "members">) =>
      channelTitle(channel, me, nameOf, accountName),
    [me, nameOf, accountName],
  );
  return { me, people, nameOf, titleOf };
};
