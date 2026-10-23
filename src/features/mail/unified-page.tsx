/**
 * "Alle Posteingänge" (`/mail/all/inbox`): the combined list, and the open mail read and answered
 * in the account it belongs to (`account` in the URL), so a reply from info@ goes out as info@.
 */
import type { MailSearch } from "@/routes/_app/mail.$accountId.$mailboxId";
import { Composer } from "./composer";
import { MailLayout } from "./mail-layout";
import { MailSidebar } from "./mail-sidebar";
import { MessageView } from "./message-view";
import { useInboxes, useMailAccounts } from "./queries";
import { UnifiedList } from "./unified-list";

export const UnifiedPage = ({ search }: { search: MailSearch }) => {
  const accounts = useMailAccounts();
  const own = accounts.find((account) => account.isPersonal);
  const inboxes = useInboxes();
  const readerAccount = search.account ?? own?.id;
  const reader = inboxes.find(({ account }) => account.id === readerAccount);
  const composeAccount = search.compose === "new" ? own?.id : readerAccount;

  return (
    <MailLayout
      search={search}
      sidebar={own ? <MailSidebar accountId={own.id} mailbox={undefined} view="unified" /> : null}
      list={inboxes.length ? <UnifiedList inboxes={inboxes} search={search} /> : null}
      main={
        search.compose && composeAccount ? (
          <Composer
            key={`${search.compose}-${search.email ?? ""}`}
            accountId={composeAccount}
            mode={search.compose}
            sourceEmailId={search.compose === "new" ? undefined : search.email}
            prefillTo={search.to}
          />
        ) : reader ? (
          <MessageView
            accountId={reader.account.id}
            mailbox={reader.mailbox}
            emailId={search.email}
          />
        ) : null
      }
    />
  );
};
