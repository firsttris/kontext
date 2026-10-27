/**
 * "Weitere Kontakte": people from the latest mails of every mailbox the user reads who are in no
 * address book, with "Zu Kontakten hinzufügen" and "Mail schreiben" (src/lib/other-contacts.ts).
 */
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Mail, Search, UserPlus } from "lucide-react";
import { useState } from "react";
import { useClient } from "@/auth/auth";
import { useSession } from "@/components/shell/app-shell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { CAPABILITIES } from "@/jmap/client";
import { recentCorrespondence } from "@/jmap/correspondence";
import { formatAddressInput } from "@/lib/addresses";
import { contactFormFor } from "@/lib/correspondent";
import { listDate } from "@/lib/format";
import { formToCard } from "@/lib/jscontact";
import { findRole } from "@/lib/mailboxes";
import { type OtherContact, otherContacts } from "@/lib/other-contacts";
import { m } from "@/paraglide/messages";
import { useAllMailboxes, useMailAccounts } from "../mail/queries";
import { usePrincipals } from "../sharing/queries";
import { startBook, useContactMutations, useContacts } from "./queries";

const useOtherContacts = (): { people: OtherContact[]; isPending: boolean } => {
  const client = useClient();
  const { data: session } = useSession();
  const accounts = useMailAccounts();
  const mailboxes = useAllMailboxes();
  const { data: contacts, isPending: contactsPending } = useContacts();
  const { data: principals = [] } = usePrincipals();
  const ready = accounts.filter((account) => mailboxes[account.id]);
  const results = useQueries({
    queries: ready.map((account) => {
      const folders = mailboxes[account.id] ?? [];
      const skip = [findRole(folders, "junk"), findRole(folders, "trash")].flatMap((box) =>
        box ? [box.id] : [],
      );
      return {
        queryKey: [account.id, "emails", "correspondence"],
        queryFn: () => recentCorrespondence(client, account.id, skip),
      };
    }),
  });
  const people = otherContacts(
    results.flatMap((result) => result.data ?? []),
    {
      own: [...accounts.map((account) => account.name), session?.username ?? ""],
      known: [
        ...contacts.flatMap((card) => Object.values(card.emails ?? {}).map((e) => e.address)),
        ...principals.flatMap((principal) => (principal.email ? [principal.email] : [])),
      ],
    },
  );
  return {
    people,
    isPending:
      contactsPending ||
      ready.length < accounts.length ||
      results.some((result) => result.isPending),
  };
};

const matches = (person: OtherContact, text: string): boolean => {
  const needle = text.trim().toLocaleLowerCase("de");
  return `${person.name} ${person.email}`.toLocaleLowerCase("de").includes(needle);
};

export const OtherContacts = () => {
  const { people, isPending } = useOtherContacts();
  const { books } = useContacts();
  const { create } = useContactMutations();
  const { data: session } = useSession();
  const mailAccountId = session?.primaryAccounts[CAPABILITIES.mail];
  const toast = useToast();
  const [text, setText] = useState("");
  const writable = books.filter((book) => book.mayWrite);
  const book = writable.find((b) => b.key === startBook(writable));
  const shown = people.filter((person) => matches(person, text));
  const now = new Date();

  const add = async (person: OtherContact) => {
    if (!book) return;
    const card = formToCard(contactFormFor(person));
    try {
      await create.mutateAsync({ card, book });
      toast.show(m.contacts_other_added({ name: person.name || person.email }));
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-4 pt-3 pb-10 md:px-10 md:pt-9">
      <Link
        to="/contacts"
        search={{}}
        className="flex items-center gap-1 text-[14px] text-muted no-underline md:hidden"
      >
        <ChevronLeft size={18} /> {m.contacts_title()}
      </Link>
      <header className="flex flex-col gap-1.5">
        <h2 className="m-0 text-[24px] font-semibold tracking-tight">{m.contacts_other()}</h2>
        <p className="m-0 text-[14px] text-muted">{m.contacts_other_info()}</p>
      </header>
      <label className="flex h-9 items-center gap-2 rounded-[9px] border border-border bg-bg px-3 text-muted">
        <Search size={15} />
        <input
          type="search"
          aria-label={m.contacts_other_search()}
          placeholder={m.contacts_other_search()}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-fg outline-none"
        />
      </label>
      {isPending ? (
        <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>
      ) : shown.length === 0 ? (
        <p className="m-0 text-[14px] text-muted">{m.contacts_other_empty()}</p>
      ) : (
        <ul aria-label={m.contacts_other()} className="m-0 flex list-none flex-col p-0">
          {shown.map((person) => {
            const name = person.name || person.email;
            const date = listDate(person.lastAt, now);
            return (
              <li
                key={person.email.toLowerCase()}
                aria-label={name}
                className="flex items-center gap-3 border-b border-border py-2.5 last:border-0"
              >
                <Avatar name={name} size={34} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{name}</span>
                  <span className="truncate text-[13px] text-muted">
                    {person.name ? `${person.email} · ` : ""}
                    {person.count === 1
                      ? m.contacts_other_meta_one({ date })
                      : m.contacts_other_meta({ count: person.count, date })}
                  </span>
                </span>
                {mailAccountId ? (
                  <Button
                    asChild
                    variant="ghost"
                    size="iconSm"
                    aria-label={m.contacts_write_mail()}
                    title={m.contacts_write_mail()}
                  >
                    <Link
                      to="/mail/$accountId/$mailboxId"
                      params={{
                        accountId: mailAccountId,
                        mailboxId: "inbox",
                      }}
                      search={{ compose: "new", to: formatAddressInput([person]) }}
                    >
                      <Mail size={15} />
                    </Link>
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="iconSm"
                  aria-label={m.contacts_other_add()}
                  title={m.contacts_other_add()}
                  disabled={!book || create.isPending}
                  onClick={() => void add(person)}
                >
                  <UserPlus size={15} />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
